import { Route } from '@/types';

import { request } from '@/utils/request';
import { load } from 'cheerio';
import iconv from 'iconv-lite';
import cache from "@/utils/cache";
import {formatDate, parseDate} from '@/utils/parse-date';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
import got from "@/utils/got";
import {getRandomHeaders} from "@/utils/random-ua";

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
            const jsonData = {};
        }
    }

    if (!title) {
        title = $('title').text().trim();
    }

    // 2. 提取正文内容
    const contentHtml = $('#contentApp').html() || '';
    // console.log('ssss', contentHtml);
    let fullContent = decodeAndExtractText(contentHtml);
    let images = extractImageUrlsWithCheerio(contentHtml);

    if (title && fullContent) {
        return {
            title,
            description: {content: fullContent, content_images: images},
            pubDate: pubDate,
        };
    }
    return null;
}
export const handler = async (ctx) => {

    // 从请求的请求体里面获取到 urls 的list，
    // items = [{id: 673306913, url: "https://news.10jqka.com.cn/20251218/c673306913.shtml"]
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
                title: `同花顺财经 - 历史要闻`,
                link: 'https://news.10jqka.com.cn',
                item: [],
                error: `解析请求数据失败: ${parseError.message}`
            };
        }
    }

    if (items.length === 0) {
            return {
                title: `同花顺财经 - 历史要闻`,
                link: 'https://news.10jqka.com.cn',
                item: [],
                description: `请通过 POST 请求提供文章列表数据。格式示例：{"urls": [{"id": "673306913", "url": "https://news.10jqka.com.cn/20251218/c673306913.shtml"}, ...]}`,
                error: '需要提供文章列表数据'
            };
        }


    // 限制处理的最大数量，防止滥用
    const MAX_ITEMS = 50;
    if (items.length > MAX_ITEMS) {
        console.warn(`请求 ${items.length} 个文章，超过限制 ${MAX_ITEMS}，将只处理前 ${MAX_ITEMS} 个`);
        items = items.slice(0, MAX_ITEMS);
    }
    // console.log('tiaoshi', items);
    const ua = getRandomHeaders();

    let processedItems = await Promise.all(
        items.map((hurl) => cache.tryGet(hurl.url, async () => {
            try {
                // 1. 获取页面
                const response = await request.get(hurl.url, {
                    responseType: 'buffer',
                    headers: {
                        //'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'User-Agent': ua['User-Agent'],
                        'Referer': 'http://news.10jqka.com.cn/',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    },
                });
                // console.log('ssssss', response);
                // 2. 解码 GBK
                const html = response.text('gbk');

                // const response = await got(hurl.url, {
                //     responseType: 'buffer',
                //     // headers: {
                //     //     'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                //     //     'Referer': 'http://news.10jqka.com.cn/',
                //     //     'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                //     // },
                //     headers: {
                //         ...ua,
                //         'Referer': 'http://news.10jqka.com.cn/',
                //     },
                // });
                // let html = iconv.decode(response.data, 'gbk');

                // 3. 解析数据
                const res = extractArticleSimple(html);

                // 4，计算阅读数据
                // https://comment.10jqka.com.cn/faceajax.php?type=add&jsoncallback=showFace&faceid=2&seq=673309945
                const commen_url = `https://comment.10jqka.com.cn/faceajax.php?type=add&jsoncallback=showFace&faceid=2&seq=${hurl.id}`;
                const response2 = await request.get(commen_url, {
                    responseType: 'buffer',
                    headers: {
                        //'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'User-Agent': ua['User-Agent'],
                        'Referer': 'http://news.10jqka.com.cn/',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    }
                });
                const html2 = response2.text('gbk');
                // const response2 = await got(commen_url, {
                //     responseType: 'buffer',
                //     // headers: {
                //     //     'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                //     //     'Referer': 'http://news.10jqka.com.cn/',
                //     //     'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                //     // },
                //     headers: {
                //         ...ua,
                //         'Referer': 'http://news.10jqka.com.cn/',
                //     },
                // });
                // let html2 = iconv.decode(response2.data, 'gbk');

                const jsonMatch = html2.match(/showFace\(({[^}]+})\)/);
                let view_count = 0;
                if (jsonMatch && jsonMatch[1]) {
                    const data = JSON.parse(jsonMatch[1]);
                    view_count = data.result; // 324
                }
                res.description.metrics = {"view_count": view_count};

                if (res) {
                    return {
                        title: res.title,
                        description: res.description,
                        pubDate: res.pubDate,
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
        title: `同花顺财经 - 最新统计数据`,
        link: '',
        item: processedItems,
        description: `同花顺财经 - 最新统计数据`,
    };
};



export const route: Route = {
    path: '/article/newest',
    name: '查看文章的最新统计数据',
    url: 'news.10jqka.com.cn',
    maintainers: ['wuquanlong'],
    handler,
    example: '/10jqka/article/newest',
    parameters: {  },
    description: `查看文章的最新统计数据`,
    categories: ['finance'],

    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportRadar: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            title: 'today_list',
            source: ['https://news.10jqka.com.cn/today_list/index.shtml'],
            target: '/news/today_list',
        },
    ],
    method: 'post',
};
