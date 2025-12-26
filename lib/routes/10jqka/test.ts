import got from '@/utils/got';
import { load } from 'cheerio';
import iconv from 'iconv-lite';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";

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

    try {
        // 1. 获取页面
        const response = await got(url, {
            responseType: 'buffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'http://news.10jqka.com.cn/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
        });

        let html = ''; // 1. 在外部定义变量

        if (Buffer.isBuffer(response.data)) {
            // 2. 将解码后的字符串赋值给外部变量
            html = iconv.decode(response.data, 'gbk');
        } else if (typeof response.data === 'string') {
            // 兜底处理：如果是字符串（虽然设置 encoding: null 后不应该出现）
            html = response.data;
        } else {
            // 如果是对象或其他类型，转为字符串
            html = JSON.stringify(response.data);
        }
        //
        console.log('HTML长度:', html.length);
        //console.log('HTML前500字符:', html.substring(0, 500));

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
