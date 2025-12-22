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
                // headers: {
                //     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                // },
                timeout: 10000, // 添加超时设置
            }).catch(() => null); // 捕获 got 请求的异常

            // 如果文章获取失败，返回基本item信息
            if (!detailResponse || !detailResponse.body) {
                console.warn(`获取文章失败: ${item.link}`);
                item.description = {
                    content: '获取文章内容失败',
                    content_images: []
                };
                return item;
            }

            const cipherTextList = detailResponse.body.match(/{"state":"(.*)","isEncrypt":true}/) ?? [];
            let content_tmp = '';

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

                    // 添加安全访问
                    content_tmp = content?.articleDetail?.articleDetailData?.data?.widgetContent || '';
                } catch (decryptError) {
                    console.warn(`解密失败: ${item.link}`, decryptError.message);
                    content_tmp = '';
                }
            }

            // 安全地处理内容提取
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

            const articleDetailTmp = {
                content: content_text || '暂无内容',
                content_images: content_images || []
            };

            item.description = articleDetailTmp;
            return item;

        } catch (error) {
            // 捕获所有未处理的异常
            console.warn(`处理文章时发生未知错误: ${item.link}`, error.message);

            // 返回带有基本信息的item
            item.description = {
                content: '文章内容获取失败',
                content_images: []
            };
            return item;
        }
    }).catch(() => {
        // 处理 tryGet 的缓存错误
        console.warn(`缓存获取失败: ${item.link}`);
        item.description = {
            content: '文章内容获取失败',
            content_images: []
        };
        return item;
    });

export { rootUrl, ProcessItem };
