import { request } from '@/utils/request';
import got from '@/utils/got';
import { load } from 'cheerio';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
import iconv from "iconv-lite";
import { getRandomHeaders } from '@/utils/random-ua';

export const route: Route = {
    path: '/test',
    categories: ['finance'],
    example: '/10jqka/test',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '同花顺财经测试',
    maintainers: ['your-name'],
    handler,
};
// 简化的提取函数
function extractArticleSimple(html) {
    const $ = load(html);

    // 1. 提取标题
    let title = '';
    let pubDate = '';
    const ldJsonScript = $('script[type="application/ld+json"]').first().html();
    if (ldJsonScript) {
        try {
            const fixedJson = ldJsonScript.trim().replace(/,\s*}/g, '}');
            const jsonData = JSON.parse(fixedJson);
            title = jsonData.headline || '';
            pubDate = jsonData.datePublished;
        } catch (error) {
            console.warn('JSON-LD 解析失败');
        }
    }

    if (!title) {
        title = $('title').text().trim();
    }

    // 2. 提取正文内容
    const contentHtml = $('#contentApp').html() || '';
    console.log('ssss', contentHtml);
    let fullContent = decodeAndExtractText(contentHtml);
    let images = extractImageUrlsWithCheerio(contentHtml);

    return {
        title,
        description: {content: fullContent, content_images: images},
        pubDate: pubDate,
    };
}

async function handler() {
    const url = 'https://news.10jqka.com.cn/20251218/c673306913.shtml';
    //const url = 'http://192.168.66.32:5001/debug';
    const ua = getRandomHeaders();

    try {
        // 1. 获取页面
        const response = await got(url, {
            responseType: 'buffer',
            headers: {
                'User-Agent': ua["User-Agent"],
                'Referer': 'http://news.10jqka.com.cn/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Sec-Ch-Ua': ua["Sec-Ch-Ua"],
                'Sec-Ch-Ua-Platform': ua["Sec-Ch-Ua-Platform"],
            },
        });
        //let html = response.text('gbk');
        let html = iconv.decode(response.data, 'gbk');
        // 3. 加载 Cheerio
        let res = extractArticleSimple(html);

        return {
            title: '同花顺财经测试',
            link: url,
            item: [res],
        };

    } catch (error) {
        console.error('请求失败:', error.message);

        return {
            title: '测试失败',
            link: url,
            item: [
                {
                    title: '请求失败',
                    link: url,
                    description: `错误信息: ${error.message}`,
                    pubDate: new Date().toUTCString(),
                },
            ],
        };
    }
}
