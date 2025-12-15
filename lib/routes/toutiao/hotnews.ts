import { Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
import { parseDate } from '@/utils/parse-date';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import fs from 'fs';
import path from 'path';
import { parseAlaData, getAllAlaDataScripts} from "./parse_html";
import got from "@/utils/got";

const __dirname = getCurrentPath(import.meta.url);

export const route: Route = {
    path: '/hotnews',
    categories: ['new-media', 'popular'],
    example: '/toutiao/hotnews',
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
            source: ['toutiao.com/hot-event/hot-board/', 'toutiao.com/'],
            target: '/hotnews',
        },
    ],
    name: '热榜',
    maintainers: ['your-name'],
    handler,
    description: '获取今日头条热榜数据，包含实时热点事件',
};

interface HotBoardItem {
    ClusterId: number;
    ClusterIdStr: string;
    Title: string;
    Label: string;
    LabelDesc: string;
    LabelUrl?: string;
    LabelUri?: {
        uri: string;
        url: string;
        url_list: Array<{ url: string }>;
    };
    Url: string;
    HotValue: string;
    QueryWord: string;
    InterestCategory: string[];
    Image?: {
        uri: string;
        url: string;
        width: number;
        height: number;
        url_list: Array<{ url: string }>;
    };
    ClusterType: number;
    Schema?: string;
}

interface HotBoardResponse {
    data: HotBoardItem[];
    fixed_top_data?: HotBoardItem[];
    message?: string;
    code?: number;
}

async function handler(ctx) {
    const baseUrl = 'https://www.toutiao.com';
    const apiUrl = `${baseUrl}/hot-event/hot-board/?origin=toutiao_pc`;

    try {
        console.log(`请求热榜API: ${apiUrl}`);

        // 获取热榜数据
        const response = await ofetch<HotBoardResponse>(apiUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': baseUrl,
                'Origin': baseUrl,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
            },
        });

        console.log(`API响应状态: ${response.code || 200}, 数据条数: ${response.data?.length || 0}`);

        // 处理数据
        const items = [];

        if (response.data && Array.isArray(response.data)) {
            console.log(`开始处理 ${response.data.length} 条热榜数据`);

            // 处理主要数据
            for (let i = 0; i < response.data.length; i++) {
                const item = response.data[i];
                if (!item || !item.Title) continue;

                const title = item.Title;
                const link = item.Url || `${baseUrl}/trending/${item.ClusterIdStr || item.ClusterId}/`;

                // 获取文章内容
                //const articleContent = await getArticleContent(item.Url, item.Title);
                //item.content = articleContent.content;

                items.push({
                    id: item.ClusterId,
                    title: title,
                    description: item, // 使用获取到的内容
                    pubDate: parseDate(new Date()),
                    guid: `toutiao-hot-${item.ClusterIdStr || title}`,
                    category: item.InterestCategory,
                });
            }

            // 如果有置顶数据，也添加进去
            if (response.fixed_top_data && Array.isArray(response.fixed_top_data)) {
                for (let i = 0; i < response.fixed_top_data.length; i++) {
                    const item = response.fixed_top_data[i];
                    if (!item || !item.Title) continue;

                    const title = `🔝 ${item.Title}`;
                    const link = item.Url || `${baseUrl}/trending/${item.ClusterIdStr || item.ClusterId}/`;

                    // 获取文章内容
                    //const articleContent = await getArticleContent(link, title);
                    //item.articleContent = articleContent;
                    items.push({
                        title: title,
                        description: item, // 使用获取到的内容
                        pubDate: parseDate(new Date()),
                        guid: `toutiao-fixed-${item.ClusterIdStr || title}-${Date.now()}`,
                    });
                }
            }

            console.log(`成功处理 ${items.length} 条数据`);

        } else {
            console.warn('API返回数据格式异常:', response);
            throw new Error('API返回数据格式异常');
        }

        // 限制返回数量，最多30条
        const finalItems = items.slice(0, 30);

        return {
            title: '今日头条热榜',
            link: apiUrl,
            item: finalItems,
            description: '今日头条实时热榜，包含最新热点事件和热门话题',
            language: 'zh-cn',
            image: 'https://sf1-ttcdn-tos.pstatp.com/obj/ttfe/pgcfe/toutiao_web_icon.png',
        };

    } catch (error) {
        console.error('获取热榜数据失败:', error);

        // 返回错误信息，但保持 RSS 格式
        return {
            title: '今日头条热榜',
            link: apiUrl,
            item: [{
                title: '获取热榜数据失败',
                link: apiUrl,
                description: `错误信息: ${error.message}<br>请稍后重试或访问原网站查看。`,
                pubDate: parseDate(new Date()),
            }],
            description: '获取今日头条热榜数据时发生错误',
            language: 'zh-cn',
            allowEmpty: true,
        };
    }
}

// 在函数外部定义缓存
const articleCache = new Map<string, { content: any[], timestamp: number }>();
const CACHE_EXPIRY = 30 * 60 * 1000; // 30分钟缓存

async function getArticleContent(url: string, title?: string): Promise<ArticleContent> {
    const baseUrl = 'https://www.toutiao.com';
    const mobileBaseUrl = 'https://m.toutiao.com';

    try {
        console.log(`获取文章内容: ${url}`);

        // 检查缓存
        const cacheKey = title || url;
        const now = Date.now();

        if (cacheKey && articleCache.has(cacheKey)) {
            const cached = articleCache.get(cacheKey)!;
            if (now - cached.timestamp < CACHE_EXPIRY) {
                console.log(`使用缓存的内容: ${cacheKey}`);
                return {
                    url: url,
                    title: title || '未知标题',
                    content: cached.content,
                    images: []
                };
            } else {
                console.log(`缓存已过期: ${cacheKey}`);
                articleCache.delete(cacheKey);
            }
        }

        // 处理 article 类型的链接
        if (url.includes('/article/')) {
            // 将桌面版链接转换为移动版链接
            const articleMatch = url.match(/article\/(\d+)/);
            if (articleMatch && articleMatch[1]) {
                const articleId = articleMatch[1];
                const mobileUrl = `${mobileBaseUrl}/article/${articleId}/?upstream_biz=toutiao_pc`;

                console.log(`转换到移动版链接: ${mobileUrl}`);

                const html = await ofetch(mobileUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'zh-CN,zh;q=0.9',
                        'Referer': baseUrl,
                    },
                });
                // const filename = `article_${articleId}`;
                // saveHtmlForDebug(html, filename, 'article');
                const $ = load(html);

                // 查找 article 标签内容
                const article = $('article.syl-article-base, article.article, article[class*="article"]');

                if (article.length > 0) {
                    // 提取文章标题
                    const articleTitle = $('h1').first().text().trim() ||
                        $('title').text().trim().split('_')[0] ||
                        title ||
                        '未知标题';

                    // 清理 article 内容，移除不需要的标签
                    article.find('script, style, iframe, noscript').remove();

                    // 提取纯文本内容
                    let plainText = article.text().trim();

                    // 清理多余的空白字符
                    plainText = plainText
                        .replace(/\s+/g, ' ')
                        .trim();

                    // 提取图片URL
                    const images: string[] = [];
                    article.find('img').each((_, img) => {
                        const $img = $(img);
                        const dataSrc = $img.attr('data-src') || $img.attr('data-original');
                        const src = $img.attr('src');

                        const imgUrl = dataSrc || src;
                        if (imgUrl && !imgUrl.startsWith('data:')) {
                            images.push(imgUrl);
                        }
                    });

                    const result = {
                        url: mobileUrl,
                        title: articleTitle,
                        content: plainText,
                        images
                    };

                    // 缓存结果
                    if (cacheKey) {
                        articleCache.set(cacheKey, {
                            content: [plainText],
                            timestamp: now
                        });
                    }

                    return result;
                }
            }
        }

        // 如果不是文章链接或者没有找到内容，使用搜索页面
        console.log(`使用搜索页面获取内容: ${title}`);
        const searchUrl = `https://so.toutiao.com/search?keyword=${encodeURIComponent(title || '热点')}`;

        const response = await fetch(url, {
            headers: {
                //'Host': 'https://so.toutiao.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                //'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                //'Accept-Language': 'zh-CN,zh;q=0.9',
                //'Accept-Encoding': 'gzip, deflate, br',
            }
        });
        const html = response.text();
        // const filename = `search_${title}`;
        // saveHtmlForDebug(html, filename, 'search');
        const htmlScripts = getAllAlaDataScripts(html);

        let content = [];
        for (const scriptContent of htmlScripts) {
            const scriptsJson = parseAlaData(scriptContent);
            if (scriptsJson && scriptsJson.display && scriptsJson.display.top_content) {
                content.push(scriptsJson.display.top_content);
            }
        }

        const result = {
            url: searchUrl,
            title: title || '未知标题',
            content: content,
            images: []
        };

        // 缓存搜索结果
        if (cacheKey) {
            articleCache.set(cacheKey, {
                content: content,
                timestamp: now
            });
        }

        return result;

    } catch (error) {
        console.error(`获取文章内容失败 (${url}):`, error.message);
        return {
            url: url,
            title: title || '未知标题',
            content: [],
            images: []
        };
    }
}

export function saveHtmlForDebug(html: string, filename: string, type: string = 'debug'): void {
    try {
        // 创建调试目录
        const debugDir = path.join(__dirname, '../debug');
        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
        }

        // 创建类型子目录
        const typeDir = path.join(debugDir, type);
        if (!fs.existsSync(typeDir)) {
            fs.mkdirSync(typeDir, { recursive: true });
        }

        // 生成完整文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fullFilename = `${filename}_${timestamp}.html`;
        const filePath = path.join(typeDir, fullFilename);

        // 保存 HTML 文件
        fs.writeFileSync(filePath, html, 'utf-8');

        console.log(`✅ HTML 已保存到: ${filePath}`);
        console.log(`📊 文件大小: ${(html.length / 1024).toFixed(2)} KB`);

    } catch (error) {
        console.error('保存调试文件失败:', error.message);
    }
}
