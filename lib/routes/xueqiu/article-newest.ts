import { Route } from '@/types';
import utils from './utils';
import got from '@/utils/got';
import {load} from "cheerio";
import cache from "@/utils/cache";
import {rootUrl} from "@/routes/cls/utils";
import {parseDate} from "@/utils/parse-date";
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
import ofetch from "@/utils/ofetch";
import {generateRandomString, getWAFWithCurl} from "@/routes/xueqiu/cookies2";
import {request} from "@/utils/request";
import {get_md5_1038} from "@/routes/xueqiu/md5_utils";

export const route: Route = {
    path: '/article/newest',
    radar: [],
    name: '文章阅读数据',
    categories: ['new-media'],
    example: '/xueqiu/article/newest',
    parameters: {
        urls: {
            description: '一个 list，多个文章的url 和 id，用来获取多个文章最新的统计数据',
            type: 'string',
            required: true,
        }
    },
    maintainers: ['wuquanlong'],
    handler,
    url: 'https://xueqiu.com/',
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
                title: `雪球-历史数据查询`,
                link: 'https://xueqiu.com/',
                item: [],
                error: `解析请求数据失败: ${parseError.message}`
            };
        }
    }

    // 限制处理的最大数量，防止滥用
    const MAX_ITEMS = 50;
    if (items.length > MAX_ITEMS) {
        console.warn(`请求 ${items.length} 个文章，超过限制 ${MAX_ITEMS}，将只处理前 ${MAX_ITEMS} 个`);
        items = items.slice(0, MAX_ITEMS);
    }

    const { wafToken: wafToken, cookies} = await getWAFWithCurl();
    const cookiesStr = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

    let processedItems = await Promise.all(
        items.map((hurl) => cache.tryGet(hurl.url, async () => {
            try {
                // 使用内置的 URL 对象进行解析
                const urlObj = new URL(hurl.url);
                // 提取协议和域名部分 (http://xueqiu.com)
                const domain: string = urlObj.origin;
                // 提取路径部分 (/5124430882/368899685)
                const path: string = urlObj.pathname;
                // 构建雪球的请求
                const randomString = generateRandomString(16);
                // 生成带签名的完整 URL（使用和 livenews 相同的方法）
                const fullUrlWithMd5 = get_md5_1038(wafToken, randomString, path, 'GET');

                const response = await got({
                    method: 'get',
                    url: fullUrlWithMd5,
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Connection': 'keep-alive',
                        'Cookie': cookiesStr,
                        'Host': 'xueqiu.com',
                        'Referer': hurl.url,
                    },
                });

                // 3. 解析数据
                const res = extractSnowmanStatus(response.data);
                let item = {}
                if (res) {
                    let metrics = {};
                    // if (item.view_count !== undefined) {
                    //     metrics.view_count = item.view_count;
                    // }
                    // reply_count
                    if (res.like_count !== undefined) {
                        metrics.like_count = res.like_count;
                    }

                    if (res.reply_count !== undefined) {
                        metrics.comment_count = res.reply_count;
                    }
                    if (res.fav_count !== undefined) {
                        metrics.collect_count = res.fav_count;
                    }
                    item.metrics = metrics;

                    let text = res.text;
                    item.content = decodeAndExtractText(text);
                    item.content_images = extractImageUrlsWithCheerio(text);

                    return {
                        title: res.title,
                        description: item,
                        pubDate: new Date(res.created_at),
                        link: hurl.url,
                        guid : hurl.id,
                        id: hurl.id,
                    };
                }
                return null; // 如果解析失败，返回 null

            } catch (error) {
                console.error(`处理链接失败 ${hurl}:`, error.message);
                // 返回一个降级的项目
                return null;
            }
        }, 5))
    );
    processedItems = processedItems.filter((item) => item !== null);

    return {
        title: `雪球 - 最新统计数据`,
        link: '',
        item: processedItems,
        description: `雪球 - 最新统计数据`,
    };
}



function extractSnowmanStatus(html: string): any | null {
    // console.log('调试', html);
    const $ = load(html);
    let result: any = null;

    $('script').each((_, element) => {
        const scriptContent = $(element).html() || '';

        if (scriptContent.includes('window.SNOWMAN_STATUS')) {
            // 1. 使用正则匹配赋值号后的内容，直到遇到下一个分号和 window.SNOWMAN_TARGET
            // 这里的重点是截取到 window.SNOWMAN_TARGET 之前的内容
            const rawMatch = scriptContent.match(/window\.SNOWMAN_STATUS\s*=\s*([\s\S]+?);\s*window\.SNOWMAN_TARGET/);

            if (rawMatch && rawMatch[1]) {
                let jsonStr = rawMatch[1].trim();

                // 2. 核心：修复非法换行
                // JSON 规范要求字符串内的换行必须是 \n，而不能是物理换行
                // 我们把那些不在引号外面的换行符处理掉（或者简单处理：移除所有控制字符换行）
                jsonStr = jsonStr.replace(/\n/g, "").replace(/\r/g, "");

                try {
                    result = JSON.parse(jsonStr);
                } catch (e) {
                    console.error('JSON 解析依然失败，尝试深度清理...');
                    // 备选方案：如果 JSON.parse 还是不行，可能是因为 key 没带引号等非标格式
                    // 此时可以使用 eval（注意安全风险，仅在受信任页面使用）
                    try {
                        // 将赋值语句构造为一个函数返回对象
                        result = new Function(`return ${jsonStr}`)();
                    } catch (evalError) {
                        console.error('深度解析失败:', evalError);
                    }
                }
            }
        }
    });
    //console.log('调试', result);
    return result;
}
