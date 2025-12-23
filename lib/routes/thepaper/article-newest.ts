import { Route } from '@/types';
import utils from './utils';
import got from '@/utils/got';
import {load} from "cheerio";
import cache from "@/utils/cache";
import {rootUrl} from "@/routes/cls/utils";
import {parseDate} from "@/utils/parse-date";
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
import ofetch from "@/utils/ofetch";

const sections = {
    hotNews: '澎湃热榜',
    financialInformationNews: '澎湃财讯',
    morningEveningNews: '早晚报',
};

export const route: Route = {
    path: '/article/newest',
    radar: [
        {
            source: ['thepaper.cn/'],
            target: '/',
        },
    ],
    name: '首页-要闻-时间倒序',
    categories: ['new-media'],
    example: '/thepaper/article/newest',
    parameters: {
        urls: {
            description: '一个 list，多个文章的url 和 id，用来获取多个文章最新的统计数据',
            type: 'string',
            required: true,
        }
    },
    maintainers: ['wuquanlong'],
    handler,
    url: 'thepaper.cn/',
    method:"post",
};

async function handler(ctx) {
    // 从请求的请求体里面获取到 urls 的list，
    // items = [{id: 123, url: https://www.thepaper.cn/newsDetail_forward_123}, {id: 124, url: https://www.thepaper.cn/newsDetail_forward_124}]
    // @todo 获取请求中的 items
    // 从请求体获取 items 数据
    let items = [];
    // console.log('调试 sss', ctx);
    // 检查是否有请求体数据（RSSHub 通常通过 ctx.req.json()
    const requestBody = await ctx.req.json();
    // console.log('调试 sss', requestBody);

    if (requestBody) {
        try {
            // 尝试解析 JSON 数据
            const bodyData = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
            // console.log('调试', bodyData);
            // 支持不同的参数名：urls, items, 或直接是数组
            if (bodyData.urls && Array.isArray(bodyData.urls)) {
                items = bodyData.urls;
            } else if (bodyData.items && Array.isArray(bodyData.items)) {
                items = bodyData.items;
            } else if (Array.isArray(bodyData)) {
                items = bodyData;
            } else if (bodyData.url && bodyData.id) {
                // 单个文章对象
                items = [bodyData];
            } else {
                throw new Error('请求体中未找到有效的 items 数据');
            }

            // 验证 items 数据格式
            items = items.filter(item => {
                // 确保每个 item 都有必要的字段
                if (!item || typeof item !== 'object') {
                    return false;
                }

                // 必须有 id 和 url
                if (!item.id || !item.url) {
                    console.warn('忽略无效的 item，缺少 id 或 url:', item);
                    return false;
                }

                // 验证 url 格式
                if (!item.url.startsWith('http')) {
                    console.warn(`忽略无效的 url: ${item.url}`);
                    return false;
                }

                // 提取 contId（如果需要）
                if (!item.id && item.url) {
                    // 尝试从 URL 中提取 contId
                    const match = item.url.match(/newsDetail_forward_(\d+)/);
                    if (match && match[1]) {
                        item.id = match[1];
                    }
                }

                return true;
            });

            if (items.length === 0) {
                throw new Error('请求体中未包含有效的文章数据');
            }

            console.log(`收到 ${items.length} 个文章需要处理`);

        } catch (parseError) {
            console.error('解析请求体数据失败:', parseError.message);
            return {
                title: `澎湃新闻 - 历史要闻`,
                link: 'https://www.thepaper.cn',
                item: [],
                error: `解析请求数据失败: ${parseError.message}`
            };
        }
    } else {
        // 如果没有请求体数据，尝试从查询参数获取（作为备选方案）
        // 注意：如果数据量大，建议还是用请求体
        const urlsParam = ctx.req?.query?.urls;
        if (urlsParam) {
            try {
                const urlsArray = JSON.parse(urlsParam);
                if (Array.isArray(urlsArray)) {
                    items = urlsArray.map(url => {
                        const match = url.match(/newsDetail_forward_(\d+)/);
                        return {
                            url: url,
                            id: match ? match[1] : url.split('/').pop()
                        };
                    });
                }
            } catch (error) {
                console.error('解析查询参数失败:', error.message);
            }
        }

        if (items.length === 0) {
            return {
                title: `澎湃新闻 - 历史要闻`,
                link: 'https://www.thepaper.cn',
                item: [],
                description: `请通过 POST 请求提供文章列表数据。格式示例：{"urls": [{"id": "123", "url": "https://www.thepaper.cn/newsDetail_forward_123"}, ...]}`,
                error: '需要提供文章列表数据'
            };
        }
    }

    // 限制处理的最大数量，防止滥用
    const MAX_ITEMS = 50;
    if (items.length > MAX_ITEMS) {
        console.warn(`请求 ${items.length} 个文章，超过限制 ${MAX_ITEMS}，将只处理前 ${MAX_ITEMS} 个`);
        items = items.slice(0, MAX_ITEMS);
    }


    try {

        const processedItems = [];
        for (const item of items) {
            try{
                const processedItem = await cache.tryGet(item.url, async () => {
                    try {
                        const detailResponse = await got({
                            method: 'get',
                            url: item.url,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': 'https://www.thepaper.cn/',
                                'Accept': 'application/json, text/plain, */*',
                            }
                        });

                        const content = load(detailResponse.data);
                        const nextDataScript = content('script#__NEXT_DATA__');

                        if (!nextDataScript.length) {
                            console.warn('文章没有 __NEXT_DATA__ 脚本:', item.link);
                            return {
                                ...item
                            };
                        }

                        let nextData;
                        try {
                            nextData = JSON.parse(nextDataScript.text());
                        } catch (error) {
                            console.warn('解析 __NEXT_DATA__ 失败:', item.link, error.message);
                            return {
                                ...item,
                            };
                        }

                        if (!nextData?.props?.pageProps?.detailData) {
                            console.warn('文章数据结构不完整:', item.link);
                            return {
                                ...item,
                            };
                        }

                        const contType = nextData.props.pageProps.detailData.contType;
                        let articleDetail = {};

                        if (contType === 8) {
                            articleDetail = nextData.props.pageProps.detailData.liveDetail || {};
                        } else {
                            articleDetail = nextData.props.pageProps.detailData.contentDetail || {};
                        }

                        // 处理内容
                        const rawContent = articleDetail?.content || articleDetail?.summary;
                        if (rawContent) {
                            try {
                                articleDetail.content = decodeAndExtractText(rawContent);
                                articleDetail.content_images = extractImageUrlsWithCheerio(rawContent);
                            } catch (error) {
                                console.warn('解码内容失败:', item.link, error.message);
                                articleDetail.content = item.title;
                                articleDetail.content_images = [];
                            }
                        } else {
                            articleDetail.content = item.title;
                            articleDetail.content_images = [];
                        }
                        let metrics = {}
                        // 通过接口，获取 点赞数，和 帖子的评论数
                        //https://api.thepaper.cn/contentapi/article/detail/interaction/state?contId=32224527&contentType=1
                        const likeCountRes = await got({
                            method: 'get',
                            url: `https://api.thepaper.cn/contentapi/article/detail/interaction/state?contId=${item.id}&contentType=1`,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': 'https://www.thepaper.cn/',
                                'Accept': 'application/json, text/plain, */*',
                            }
                        });
                        // console.log('调试aaa1', likeCountRes);
                        if (likeCountRes?.data?.data?.praiseTimes) {
                            metrics.like_count = Number(likeCountRes.data.data.praiseTimes);
                        }
                        const commentCountRes = await got({
                            method: 'post',
                            url: `https://api.thepaper.cn/comment/news/comment/count`,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': 'https://www.thepaper.cn/',
                                'Accept': 'application/json, text/plain, */*',
                            },
                            body: {contId: item.id}
                        });
                        // console.log('调试aaa2', commentCountRes);
                        if (commentCountRes?.data?.data?.commentNum) {
                            metrics.comment_count = Number(commentCountRes.data.data.commentNum);
                        }
                        articleDetail.metrics = metrics;
                        item.description = articleDetail;
                        item.author = articleDetail?.author?.name ?? item.author ?? '';
                        item.link = item.url;
                        item.pubDate = articleDetail?.publishTime? parseDate(articleDetail.publishTime) : '';
                        item.title = articleDetail?.name?? '';
                        return item;

                    } catch (error) {
                        console.error('处理文章时发生错误:', item.link, error.message);

                        // 返回降级数据，确保有返回值
                        return {
                            ...item,
                        };
                    }
                }, 5);
                processedItems.push(processedItem);
                // 可选：添加一个小的延迟，避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`处理项目失败: ${item.link}`, error);
                // 即使失败也保留一个基础项
                processedItems.push({
                    ...item,
                });
            }
        }

        items = processedItems;
        // 再次检查 items 是否为空
        if (items.length === 0) {
            throw new Error('No valid items found after processing');
        }

        return {
            title: `澎湃新闻 - 历史要闻 - 最新数据`,
            link: 'https://www.thepaper.cn',
            item: items,
            description: `澎湃新闻  要闻更新`,
        };

    } catch (error) {
        console.error('sonmething error:', error);

        // 返回一个错误消息，而不是空数组
        return {
            title: `澎湃新闻 - 历史要闻 - 最新情况`,
            link: 'https://www.thepaper.cn',
            item: [],
        };
    }
}
