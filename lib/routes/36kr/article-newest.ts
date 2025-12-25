import { Route } from '@/types';
import { getSubPath } from '@/utils/common-utils';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';

import { rootUrl, ProcessItem } from './utils';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";

const shortcuts = {
    '/information': '/information/web_news',
    '/information/latest': '/information/web_news',
    '/information/recommend': '/information/web_recommend',
    '/information/life': '/information/happy_life',
    '/information/estate': '/information/real_estate',
    '/information/workplace': '/information/web_zhichang',
};

export const route: Route = {
    path: '/article/newest',
    categories: ['new-media'],
    example: '/36kr/article/newest',
    parameters: {},
    name: '查询文章最新的阅读情况',
    maintainers: ['wuquanlong'],
    description: `查询文章统计数据`,
    handler,
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


    // 限制处理的最大数量，防止滥用
    const MAX_ITEMS = 50;
    if (items.length > MAX_ITEMS) {
        console.warn(`请求 ${items.length} 个文章，超过限制 ${MAX_ITEMS}，将只处理前 ${MAX_ITEMS} 个`);
        items = items.slice(0, MAX_ITEMS);
    }
    // console.log('调试', items);

    items = await Promise.all(items.map((item) => ProcessItem(item, cache.tryGet)));


    return {
        title: `36氪 - 刷新文章阅读数据`,
        link: '',
        item: items,
    };
}
