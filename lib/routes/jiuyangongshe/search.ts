import { Data, Route, ViewType } from '@/types';
import type { Context } from 'hono';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';
import md5 from '@/utils/md5';
import cache from "@/utils/cache";
import got from "@/utils/got";
import fs from 'fs/promises';
import {load} from "cheerio";
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
export const route: Route = {
    path: '/search',
    categories: ['finance'],
    view: ViewType.Articles,
    example: '/jiuyangongshe/search?k=关键词',
    parameters: {
        k: '关键字，必填',
        limit: '返回数量，默认为15，最大不超过50',
        order: '排序方式：1-时间倒序，2-热度倒序，默认为1'
    },
    maintainers: ['wuquanlong'],
    name: '关键字搜索',
    handler,
    radar: [
        {
            source: ['www.jiuyangongshe.com'],
        },
    ],
};

async function handler(ctx: Context): Promise<Data> {
    const baseUrl = 'https://www.jiuyangongshe.com';
    const keyword = ctx.req.query('k');

    // 验证必填参数
    if (!keyword) {
        return {
            title: '关键字搜索 - 韭研公社-研究共享，茁壮成长（原韭菜公社）',
            description: '请输入搜索关键字',
            link: baseUrl,
            language: 'zh-CN',
            item: [],
        };
    }

    const timestamp = Date.now().toString();
    const limit = Math.min(
        Number.parseInt(ctx.req.query('limit') || '15', 10),
        10
    );
    const order = Number.parseInt(ctx.req.query('order') || '1', 10);

    const response = await ofetch('https://app.jiuyangongshe.com/jystock-app/api/v2/article/search', {
        method: 'POST',
        headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            Origin: 'https://www.jiuyangongshe.com',
            Referer: 'https://www.jiuyangongshe.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            platform: '3',
            timestamp: timestamp,
            token: md5(`Uu0KfOB8iUP69d3c:${timestamp}`)
        },
        body: JSON.stringify({
            back_garden: 0,
            keyword:keyword,
            limit:limit,
            order: [1, 2].includes(order) ? order : 1,
            start: 0,
            type: '1',
        }),
    });
    // console.log('ssssss', response);
    // 添加数据验证
    if (!response?.data?.result) {
        throw new Error('API返回数据格式异常');
    }

    //const items = response.data.result.map((item: any) => (

    let items = response.data.result.map((item) => ({
        title: item.title,
        link: `${baseUrl}/a/${item.article_id}`,
        description: {content: item.content},
        pubDate: timezone(parseDate(item.create_time || item.sync_time || Date.now(), 'YYYY-MM-DD HH:mm:ss'), 8),
        updated: item.sync_time ? timezone(parseDate(item.sync_time, 'YYYY-MM-DD HH:mm:ss'), 8) : undefined,
        guid: item.article_id ? item.article_id : undefined,
        author: item.user?.nickname || '未知作者',
        category: item.stock_list?.map((stock: any) => stock.name) || [],
    }));

    const processedItems = [];
    for (let item of items) {

        const processedItem = await cache.tryGet(item.link, async () => {
            // 尝试请求文章来获取数据
            let tmp = await getArticleContent(item.link);
            if (tmp) {
                item.description = tmp;
            }
            return item;

        });

        processedItems.push(processedItem);
        // 可选：添加一个小的延迟，避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 500));
    }


    const title = keyword
        ? `"${keyword}"的搜索结果 - 韭研公社`
        : '关键字搜索 - 韭研公社';

    return {
        title,
        description: '韭研公社搜索结果',
        link: `${baseUrl}/search?k=${keyword}`,
        language: 'zh-CN',
        item: items,
    };
}

async function getArticleContent(url) {

    // 查看一个文章的数据
    const timestamp2 = Date.now().toString();
    const detailResponse = await got({
        method: 'get',
        url: url,
        // 添加一些常见的请求头
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': 'https://www.jiuyangongshe.com/',
            platform: '3',
            timestamp: timestamp2,
            token: md5(`Uu0KfOB8iUP69d3c:${timestamp2}`)
        }
    });
    // console.log('sssss', detailResponse.data);
    let res = parseNUXTFromIIFE(detailResponse.data);
    if (res?.data?.[0]?.data) {
        let articleData = res.data[0].data;
        if (articleData.content) {
            let tmp = articleData.content;
            articleData.content = decodeAndExtractText(tmp);
            articleData.content_images = extractImageUrlsWithCheerio(tmp);
        }
        return articleData;
    }
    return null;
}

function parseNUXTFromIIFE(html) {
    // 查找脚本标签
    const scriptMatch = html.match(/<script>\s*window\.__NUXT__\s*=\s*(\(function[^)]*\)\s*{[\s\S]*?}\([^)]*\)\));?\s*<\/script>/);

    if (!scriptMatch) return null;

    const iifeCode = scriptMatch[1];

    try {
        // 提取函数参数和返回值
        const funcMatch = iifeCode.match(/\(function\(([^)]*)\)\s*{\s*return\s*({[\s\S]*?})\s*}\s*\(([^)]*)\)\)/);

        if (!funcMatch) return null;

        const params = funcMatch[1].split(',').map(p => p.trim());
        const returnObj = funcMatch[2];
        const args = funcMatch[3].split(',').map(arg => {
            arg = arg.trim();

            // 处理不同类型的参数
            if (arg === 'null') return null;
            if (arg === 'true') return true;
            if (arg === 'false') return false;
            if (arg === 'Array(0)') return [];
            if (/^\d+(\.\d+)?$/.test(arg)) return parseFloat(arg);
            if (/^"[^"]*"$/.test(arg)) return JSON.parse(arg);
            if (/^'[^']*'$/.test(arg)) return arg.slice(1, -1);

            // 解码 Unicode 转义
            if (/^\\u[0-9A-F]{4}/i.test(arg)) {
                return arg.replace(/\\u([0-9A-F]{4})/gi,
                    (_, hex) => String.fromCharCode(parseInt(hex, 16))
                );
            }

            return arg;
        });

        // 构建参数映射
        const paramMap = {};
        params.forEach((param, index) => {
            if (param && index < args.length) {
                paramMap[param] = args[index];
            }
        });

        // 替换返回值中的参数引用
        let resultJson = returnObj;
        Object.keys(paramMap).forEach(key => {
            const value = paramMap[key];
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            resultJson = resultJson.replace(regex,
                typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
            );
        });

        // 修复其他 JavaScript 语法
        resultJson = resultJson
            .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
            .replace(/,\s*([}\]])/g, '$1');

        return JSON.parse(resultJson);

    } catch (error) {
        console.error('解析 IIFE 失败:', error);
        return null;
    }
}
