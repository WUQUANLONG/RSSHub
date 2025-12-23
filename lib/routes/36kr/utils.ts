// import got from '@/utils/got-scraping';
import got from '@/utils/got';
import { load } from 'cheerio';
import CryptoJS from 'crypto-js';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
const rootUrl = 'https://www.36kr.com';

// const ProcessItem = (item, tryGet) =>
//     tryGet(item.link, async () => {
//         const detailResponse = await got({
//             method: 'get',
//             url: item.link,
//         });
//         // 如果文章获取失败了，也做一个返回 不能抛异常
//         if (!detailResponse) {
//             item.description = {};
//             return item;
//         }
//         const cipherTextList = detailResponse.data.match(/{"state":"(.*)","isEncrypt":true}/) ?? [];
//         let content_tmp = ''
//         if (cipherTextList.length === 0) {
//             const $ = load(detailResponse.body);
//             content_tmp = $('div.articleDetailContent').html();
//
//         } else {
//             const key = CryptoJS.enc.Utf8.parse('efabccee-b754-4c');
//             const content = JSON.parse(
//                 CryptoJS.AES.decrypt(cipherTextList[1], key, {
//                     mode: CryptoJS.mode.ECB,
//                     padding: CryptoJS.pad.Pkcs7,
//                 })
//                     .toString(CryptoJS.enc.Utf8)
//                     .toString()
//             ).articleDetail.articleDetailData.data;
//
//             content_tmp = content.widgetContent;
//
//         }
//         let content_text = decodeAndExtractText(content_tmp);
//         let content_images = extractImageUrlsWithCheerio(content_tmp);
//         let articleDetailTmp = {}
//         articleDetailTmp.content = content_text;
//         articleDetailTmp.content_images = content_images;
//         item.description = articleDetailTmp;
//         return item;
//     });

const ProcessItem = (item, tryGet) =>
    tryGet(item.link, async () => {
        try {
            const detailResponse = await got({
                method: 'get',
                url: item.link,
                timeout: 10000,
                http2: false,
                headers: {
                    //'x-prefer-proxy': 1
                },
            });

            if (!detailResponse || !detailResponse.body) {
                console.warn(`获取文章失败: ${item.link}`);
                item.description = {
                    content: '获取文章内容失败',
                    content_images: []
                };
                return item;
            }

            let content_tmp = '';
            let stat_tmp = null;
            let initialState = null;

            try {
                const $ = load(detailResponse.body);
                const scriptTags = $('script');

                scriptTags.each((i, el) => {
                    const scriptContent = $(el).html();
                    if (scriptContent && scriptContent.includes('window.initialState')) {
                        try {
                            // 方法1：使用更简单的正则
                            const match = scriptContent.match(/window\.initialState\s*=\s*(\{[\s\S]*\})(?:\s*;|$)/);
                            if (match && match[1]) {
                                initialState = JSON.parse(match[1]);
                                return false;
                            }

                            // 方法2：直接查找等号位置
                            const eqIndex = scriptContent.indexOf('window.initialState=');
                            if (eqIndex !== -1) {
                                const jsonStart = eqIndex + 'window.initialState='.length;
                                let jsonStr = scriptContent.substring(jsonStart);

                                // 移除可能的分号
                                jsonStr = jsonStr.replace(/;\s*$/, '');

                                // 尝试解析
                                initialState = JSON.parse(jsonStr);
                                return false;
                            }
                        } catch (error) {
                            console.warn('解析 initialState 失败:', error.message);
                        }
                    }
                });

                // 从 initialState 中提取内容和统计信息
                const articleDetail = initialState?.articleDetail;
                if (articleDetail) {
                    // 提取文章内容
                    const articleDetailData = articleDetail?.articleDetailData?.data;
                    if (articleDetailData?.widgetContent) {
                        content_tmp = articleDetailData.widgetContent;
                    }

                    // 提取统计信息
                    stat_tmp = articleDetail?.articleRecommendData || null;
                }
                // console.log('调试sssss', [initialState, stat_tmp]);
            } catch (jsonError) {
                console.warn(`解析 initialState 失败: ${item.link}`, jsonError.message);
            }

            // 如果从 initialState 没有提取到内容，回退到原来的解密逻辑
            if (!content_tmp) {
                const cipherTextList = detailResponse.body.match(/{"state":"(.*)","isEncrypt":true}/) ?? [];

                if (cipherTextList.length === 0) {
                    const $ = load(detailResponse.body);
                    content_tmp = $('div.articleDetailContent').html() || '';
                } else {
                    try {
                        const key = CryptoJS.enc.Utf8.parse('efabccee-b754-4c');
                        const content = JSON.parse(
                            CryptoJS.AES.decrypt(cipherTextList[1], key, {
                                mode: CryptoJS.mode.ECB,
                                padding: CryptoJS.pad.Pkcs7,
                            })
                                .toString(CryptoJS.enc.Utf8)
                                .toString()
                        );

                        content_tmp = content?.articleDetail?.articleDetailData?.data?.widgetContent || '';

                        // 如果之前没有获取到统计信息，现在获取
                        if (!stat_tmp) {
                            stat_tmp = content?.articleDetail?.articleRecommendData || null;
                        }

                    } catch (decryptError) {
                        console.warn(`解密失败: ${item.link}`, decryptError.message);
                        content_tmp = '';
                    }
                }
            }

            // 如果还是没有内容，尝试其他可能的选择器
            if (!content_tmp) {
                const $ = load(detailResponse.body);
                content_tmp = $('div.articleDetailContent').html() ||
                    $('article.content').html() ||
                    $('.article-content').html() ||
                    $('.content-wrapper').html() || '';
            }

            let content_text = '';
            let content_images = [];

            try {
                content_text = decodeAndExtractText(content_tmp) || '';
            } catch (textError) {
                console.warn(`文本提取失败: ${item.link}`, textError.message);
            }

            try {
                content_images = extractImageUrlsWithCheerio(content_tmp) || [];
            } catch (imageError) {
                console.warn(`图片提取失败: ${item.link}`, imageError.message);
            }

            // 初始化描述对象
            let articleDetailTmp = {
                content: content_text || '暂无内容',
                content_images: content_images || []
            };

            // 添加文章统计信息（只有有值时才添加）
            if (stat_tmp && typeof stat_tmp === 'object') {
                if (stat_tmp.statPraise !== undefined && stat_tmp.statPraise !== null) {
                    articleDetailTmp.like_count = Number(stat_tmp.statPraise);
                }
                if (stat_tmp.statComment !== undefined && stat_tmp.statComment !== null) {
                    articleDetailTmp.comment_count = Number(stat_tmp.statComment);
                }
                if (stat_tmp.statCollect !== undefined && stat_tmp.statCollect !== null) {
                    articleDetailTmp.collect_count = Number(stat_tmp.statCollect);
                }
                if (stat_tmp.statArticle !== undefined && stat_tmp.statArticle !== null) {
                    articleDetailTmp.view_count = Number(stat_tmp.statArticle);
                }
                // 添加分享数（如果存在）
                if (stat_tmp.statShare !== undefined && stat_tmp.statShare !== null) {
                    articleDetailTmp.share_count = Number(stat_tmp.statShare);
                }
            }

            // 如果从 initialState 获取到了其他有用信息，也可以添加
            // 暂时不需要

            item.description = articleDetailTmp;
            return item;

        } catch (error) {
            console.warn(`处理文章时发生未知错误: ${item.link}`, error.message);
            item.description = {
                content: '文章内容获取失败',
                content_images: []
            };
            return item;
        }
    }, 5).catch(() => {
        console.warn(`缓存获取失败: ${item.link}`);
        item.description = {
            content: '文章内容获取失败',
            content_images: []
        };
        return item;
    });

export { rootUrl, ProcessItem };
