import { Route } from '@/types';

import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';

import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";

export const route: Route = {
    path: '/detail/newest',
    categories: ['finance'],
    example: '/cls/detail/newest',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['cls.cn/'],
        },
    ],
    name: '文章统计数据',
    maintainers: ['wuquanlong'],
    handler,
    url: 'cls.cn/',
    method: 'post',
};
async function handler(ctx) {
    // 从请求的请求体里面获取到 urls 的list，
    // items = [{id: 2238866, url: "https://www.cls.cn/detail/2238866"]
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
                title: `财联社 - 历史要闻`,
                link: 'https://www.cls.cn',
                item: [],
                error: `解析请求数据失败: ${parseError.message}`
            };
        }
    }

    if (items.length === 0) {
        return {
            title: `财联社 - 历史要闻`,
            link: 'https://www.cls.cn',
            item: [],
            description: `请通过 POST 请求提供文章列表数据。格式示例：{"urls": [{"id": "123", "url": "https://www.cls.cn/detail/123"}, ...]}`,
            error: '需要提供文章列表数据'
        };
    }


    // 限制处理的最大数量，防止滥用
    const MAX_ITEMS = 50;
    if (items.length > MAX_ITEMS) {
        console.warn(`请求 ${items.length} 个文章，超过限制 ${MAX_ITEMS}，将只处理前 ${MAX_ITEMS} 个`);
        items = items.slice(0, MAX_ITEMS);
    }


    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.url, async () => {
                const { data: detailResponse } = await got(item.url);

                const $$ = load(detailResponse);

                const data = JSON.parse($$('script#__NEXT_DATA__').text())?.props?.initialState?.detail?.articleDetail ?? undefined;

                if (!data) {
                    return item;
                }

                const title = data.title;
                let contnet = {}
                contnet.content = decodeAndExtractText(data.content);
                contnet.content_images = extractImageUrlsWithCheerio(data.content);
                let metrics = {};
                if (data.readingNum !== undefined) {
                    metrics.view_count = data.readingNum;
                }
                if (data.commentNum !== undefined) {
                    metrics.comment_count = data.commentNum;
                }
                contnet.metrics = metrics;

                const guid = `${data.id}`;
                const image = data.images?.[0] ?? undefined;

                item.link = item.url;
                item.title = title;
                item.description = contnet;
                item.pubDate = parseDate(data.ctime, 'X');
                item.category = [...new Set(data.subject?.flatMap((s) => [s.name, ...(s.subjectCategory?.flatMap((c) => [c.columnName || [], c.name || []]) ?? [])]))].filter(Boolean);
                item.author = data.author?.name ?? item.author;
                item.guid = guid;
                item.id = guid;
                item.image = image;
                item.banner = image;
                item.enclosure_url = data.audioUrl;
                item.enclosure_type = item.enclosure_url ? `audio/${item.enclosure_url.split(/\./).pop()}` : undefined;
                item.enclosure_title = title;

                return item;
            }, 5)
        )
    );


    return {
        title: `财联社 - 文章最新统计`,
        description: `财联社 - 文章最新统计`,
        link: `https://www.cls.cn/detail/`,
        item: items,
        allowEmpty: true,
    };
};
