import { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
import {getRandomHeaders} from "@/utils/random-ua";

export const route: Route = {
    path: '/article/newest',
    categories: ['finance'],
    example: '/wallstreetcn/article/newest',
    parameters: {
        urls: {
            description: '一个 list，多个文章的url 和 id，用来获取多个文章最新的统计数据',
            type: 'string',
            required: true,
        }
    },
    radar: [],
    name: '查询历史文章的最新统计数据',
    maintainers: ['wuquanlong'],
    handler,
    description: `查询历史文章的最新统计数据`,
    method: 'post',
};

async function handler(ctx) {
    // 从请求的请求体里面获取到 urls 的list，
    // items = [{id: 3761964, url: "https://api-one.wallstcn.com/apiv1/content/articles/3761964?extract=0"]
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

    const ua = getRandomHeaders();
    const referer = 'https://wallstreetcn.com/';
    const apiRootUrl = 'https://api-one.wallstcn.com';
    let processedItems = [];
    processedItems = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.url, async () => {

                // 数据有几种类型， theme live article 目前 theme live 在pc 端页面未展示
                // article https://api-one-wscn.awtmt.com/apiv1/content/articles/3761829?extract=0
                const url_tmp = `${apiRootUrl}/apiv1/content/articles/${item.id}?extract=0`;
                //const url_tmp = `${apiRootUrl}/apiv1/content/${item.type === 'chart' ? `charts/${item.guid}` : `articles/${item.guid}?extract=0`}`;

                const detailResponse = await got({
                    method: 'get',
                    url: url_tmp,
                    headers: {
                        ...ua,
                        'Referer': referer,
                    },
                });

                const responseData = detailResponse.data;

                // 处理 { code: 60301, message: '内容不存在或已被删除', data: {} }
                if (responseData.code !== 20000) {
                    return null;
                }

                const data = responseData.data;

                item.title = data.title || data.content_text;
                item.author = data.source_name ?? data.author.display_name;

                let content = data.content + (data.content_more ?? '');
                data.content = decodeAndExtractText(content);
                data.content_images = extractImageUrlsWithCheerio(content);
                let metrics = {};
                if (data.pageviews !== undefined) {
                    metrics.view_count = data.pageviews;
                    data.metrics = metrics;
                }

                item.description = data;

                item.category = data.asset_tags?.map((t) => t.name) ?? [];

                if (data.audio_uri) {
                    item.enclosure_type = 'audio/mpeg';
                    item.enclosure_url = data.audio_uri;
                    item.itunes_item_image = data.image?.uri ?? '';
                    item.itunes_duration = data.audio_info?.duration ?? '';
                }
                item.url = url_tmp;
                item.link = url_tmp;
                delete item.type;
                item.pubDate = parseDate(data.display_time * 1000);
                return item;
            }, 5)
        )
    );

    processedItems = processedItems.filter((item) => item !== null);

    return {
        title: `华尔街见闻 - 文章最新统计`,
        link: `https://wallstreetcn.com/news/`,
        item: processedItems,
        itunes_author: '华尔街见闻',
        image: 'https://static.wscn.net/wscn/_static/favicon.png',
    };
}
