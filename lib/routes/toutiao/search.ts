import { Route, Context } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
import { parseDate } from '@/utils/parse-date';
import ofetch from '@/utils/ofetch';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import got from "@/utils/got";
import {getAllAlaDataScripts, parseAlaData} from "@/routes/toutiao/parse_html";

const __dirname = getCurrentPath(import.meta.url);

// 修改searchToutiao函数，添加更多调试信息
async function searchToutiao(keyword: string): Promise<SearchResult[]> {
    try {
        // 第一步：获取Cookie
        console.log(`\n🔍 [${new Date().toISOString()}] 开始搜索: "${keyword}"`);

        // 第二步：使用Cookie进行搜索
        const searchUrl = 'https://so.toutiao.com/search';

        //console.log(`🌐 发送搜索请求到: ${searchUrl}`);
        //console.log(`📝 查询参数: keyword=${keyword}`);
        const queryString = new URLSearchParams({
            keyword: keyword,
            pd: 'information',
        }).toString();
        const fullUrl = `${searchUrl}?${queryString}`;
        const response = await ofetch(fullUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'curl/8.2.1', // 使用和 curl 一样的 User-Agent
                'Accept': '*/*', // 使用和 curl 一样的 Accept 头
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
            },
            // 特别针对 ofetch 的选项
            responseType: 'text', // 确保返回文本
            parseResponse: (txt) => txt, // 不自动解析
        });
        //console.log('sssss', response);

        // 检查常见问题
        if (response.length < 50000) {
            console.warn(`⚠️  警告: HTML内容过短 (${response.length} 字符)，可能不是完整页面`);

            // 检查是否是反爬页面
            const antiCrawlerSignals = [
                { pattern: 'byted_acrawler', name: '字节反爬脚本' },
                { pattern: '__ac_signature', name: '签名验证' },
                { pattern: 'window.location.reload', name: '页面重定向' },
                { pattern: '正在验证', name: '验证页面' },
                { pattern: '请完成安全验证', name: '安全验证' },
                { pattern: 'captcha', name: '验证码' },
                { pattern: 'challenge', name: '挑战页面' }
            ];

            for (const signal of antiCrawlerSignals) {
                if (response.includes(signal.pattern)) {
                    console.warn(`⚠️  检测到反爬信号: ${signal.name}`);
                }
            }

            // 检查是否缺少关键元素
            const missingElements = [
                { element: '<div', description: 'div元素' },
                { element: '<script', description: 'script元素' },
                { element: '头条', description: '头条文本' },
                { element: '搜索结果', description: '搜索结果文本' }
            ];

            for (const elem of missingElements) {
                if (!response.includes(elem.element)) {
                    console.warn(`⚠️  缺少${elem.description}`);
                }
            }
        }

        // 第三步：尝试多种解析方法
        // console.log(`\n🔧 开始解析HTML内容...`);
        return await processResponse(response, keyword, searchUrl);

    } catch (error) {
        console.error(`❌ 搜索"${keyword}"时出错:`, error);
        throw error;
    }
}

// 修改processResponse函数，添加更多解析尝试
async function processResponse(html: string, keyword: string, searchUrl: string): Promise<SearchResult[]> {

    const htmlScripts = getAllAlaDataScripts(html);
    let items = [];
    for (const scriptContent of htmlScripts) {
        const scriptsJson = parseAlaData(scriptContent);
        if (!scriptsJson) continue;

        // 1. 从 top_content 获取 abstract（主要来源）
        if (scriptsJson.display) {
            let title = scriptsJson.display.title? (scriptsJson.display.title.text ? scriptsJson.display.title.text : '') : '';
            let guid = scriptsJson.display.info? (scriptsJson.display.info.docid ? scriptsJson.display.info.docid: scriptsJson.display.self_info.group_id): scriptsJson.display.self_info.group_id;
            let create_time = parseDate(Number(scriptsJson.display.self_info.timestamp) * 1000);
            let item = scriptsJson.display;
            delete (item as any).self_info;
            items.push({
                title: title,
                description: item, // 使用获取到的内容
                pubDate: create_time,
                guid: `toutiao-search-${guid}`,
            });
        }

    }
    //console.log('sssss', items);
    return items;
}


// 保持handler函数不变
export const route: Route = {
    path: '/search',
    categories: ['new-media', 'popular'],
    example: '/toutiao/search?k=科技',
    parameters: {
        k: {
            description: '搜索关键词',
            type: 'string',
            required: true,
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '搜索',
    maintainers: ['wuquanlong'],
    handler,
    description: '今日头条搜索，支持中文关键词搜索文章',
};

async function handler(ctx: Context): Promise<{
    title: string;
    link: string;
    item: SearchResult[];
    description?: string;
    language?: string;
    lastBuildDate?: string;
    ttl?: number;
}> {
    const { k } = ctx.req.query();

    if (!k || k.trim().length === 0) {
        throw new Error('搜索关键词不能为空');
    }

    const keyword = k.trim();
    const searchUrl = `https://so.toutiao.com/search?keyword=${encodeURIComponent(keyword)}&pd=information`;

    try {
        const items = await searchToutiao(keyword);
        //console.log(`\n🎉 搜索完成: 找到 ${items.length} 个结果`);
        return {
            title: `今日头条搜索 - ${keyword}`,
            link: searchUrl,
            item: items,
            language: 'zh-cn',
            lastBuildDate: new Date().toUTCString(),
            ttl: 600,
        };

    } catch (error) {
        console.error('处理搜索请求时出错:', error);

        return {
            title: `今日头条搜索 - ${keyword}`,
            link: searchUrl,
            item: [],
            description: `搜索"${keyword}"时出错: ${(error as Error).message}`,
            language: 'zh-cn',
        };
    }
}
