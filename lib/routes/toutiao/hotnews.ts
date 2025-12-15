import { Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
import {formatDate, parseDate} from '@/utils/parse-date';
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
                const articleContent = await getArticleContent(item.Url, item.Title);
                item.content = articleContent.content;
                item.content_images = articleContent.images;

                items.push({
                    id: item.ClusterId,
                    title: title,
                    description: item, // 使用获取到的内容
                    pubDate: articleContent.create_time,
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
                    const articleContent = await getArticleContent(link, title);
                    item.content = articleContent.content;
                    item.content_images = articleContent.images;

                    items.push({
                        title: title,
                        description: item, // 使用获取到的内容
                        pubDate: articleContent.create_time,
                        guid: `toutiao-fixed-${item.ClusterIdStr || title}`,
                    });
                }
            }

            console.log(`成功处理 ${items.length} 条数据`);

        } else {
            console.warn('API返回数据格式异常:', response);
            throw new Error('API返回数据格式异常');
        }

        // 限制返回数量，最多30条
        // const finalItems = items.slice(0, 30);

        return {
            title: '今日头条热榜',
            link: apiUrl,
            item: items,
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
const CACHE_EXPIRY = 10 * 60 * 1000; // 30分钟缓存

async function getArticleContent(url: string, title?: string): Promise<ArticleContent> {
    const baseUrl = 'https://www.toutiao.com';
    const mobileBaseUrl = 'https://m.toutiao.com';


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
                create_time: cached.create_time,
                images: []
            };
        } else {
            console.log(`缓存已过期: ${cacheKey}`);
            articleCache.delete(cacheKey);
        }
    }

    // 处理 article 类型的链接
    // 修改后的主处理逻辑
    if (url.includes('/article/')) {
        const articleMatch = url.match(/article\/(\d+)/);
        let articleInfo = '';
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

            // 使用新的提取函数
            articleInfo = await extractArticleInfo(html, mobileUrl, title);

            // 检查是否有内容
            if (articleInfo.content[0]?.trim()) {
                // 缓存结果
                if (cacheKey) {
                    articleCache.set(cacheKey, {
                        content: articleInfo.content,
                        create_time: articleInfo.create_time,
                        images: articleInfo.images,
                        timestamp: now
                    });
                }

                return articleInfo;
            }
        }
        // 如果没有找到文章内容，可以添加回退逻辑
        if (!articleInfo || !articleInfo.content[0]?.trim()) {
            console.log('未能提取到文章内容，尝试其他提取方式...');
            // 这里可以添加其他提取逻辑或返回错误信息
            return {
                url: mobileUrl,
                title: title || '未知标题',
                content: ['无法提取文章内容'],
                create_time: '',
                images: [],
                error: '无法提取文章内容'
            };
        }
    }



    // 如果不是文章链接或者没有找到内容，使用搜索页面
    console.log(`使用搜索页面获取内容: ${title}`);
    const searchUrl = `https://so.toutiao.com/search?keyword=${encodeURIComponent(title || '热点')}`;

    const response = await ofetch(searchUrl, {
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
    // const filename = `search_${title}`;
    // saveHtmlForDebug(html, filename, 'search');
    const htmlScripts = getAllAlaDataScripts(response);

    let content = [];
    let images = [];
    let pubDate = '';
    for (const scriptContent of htmlScripts) {
        const scriptsJson = parseAlaData(scriptContent);
        if (!scriptsJson) continue;

        // 1. 从 top_content 获取 abstract（主要来源）
        if (scriptsJson.display?.top_content?.abstract) {
            content.push(scriptsJson.display.top_content.abstract);
            pubDate = parseDate(Number(scriptsJson.display.top_content.create_time) * 1000);

        }
        // 同时可以获取图片
        if (scriptsJson.display?.top_content?.image_url) {
            images.push(scriptsJson.display.top_content.image_url);
        }
        if (scriptsJson.display?.top_content?.large_image_url) {
            images.push(scriptsJson.display.top_content.large_image_url);
        }
    }

    const result = {
        url: searchUrl,
        title: title || '未知标题',
        content: content,
        create_time:pubDate ? pubDate: '',
        images: []
    };

    // 缓存搜索结果
    if (cacheKey) {
        articleCache.set(cacheKey, {
            content: content,
            create_time: pubDate,
            images: images,
            timestamp: now
        });
    }

    return result;

}

// 提取结构化数据函数
function extractStructuredData($) {
    let structuredData = null;

    // 查找 type="application/ld+json" 的 script 标签
    $('script[type="application/ld+json"]').each((_, element) => {
        try {
            const jsonText = $(element).text();
            if (jsonText) {
                const data = JSON.parse(jsonText);

                // 检查是否是新闻文章类型
                if (data['@type'] === 'NewsArticle' ||
                    data['@type'] === 'Article' ||
                    data['@type'] === 'BlogPosting') {
                    structuredData = data;
                    return false; // 停止遍历
                }
            }
        } catch (error) {
            console.warn('解析 JSON-LD 数据失败:', error.message);
        }
    });

    return structuredData;
}

// 从页面其他位置提取发布时间（备用方案）
function extractPublishTimeFromHtml($) {
    // 1. 从 meta 标签提取
    const metaSelectors = [
        'meta[property="article:published_time"]',
        'meta[name="article:published_time"]',
        'meta[property="og:article:published_time"]',
        'meta[name="date"]',
        'meta[property="article:modified_time"]',
        'meta[property="og:article:modified_time"]',
        'meta[name="publish_date"]',
        'meta[itemprop="datePublished"]'
    ];

    for (const selector of metaSelectors) {
        const time = $(selector).attr('content');
        if (time) return time;
    }

    // 2. 从 time 标签提取
    const timeSelectors = [
        'time[datetime]',
        'time[pubdate]',
        '[itemprop="datePublished"]'
    ];

    for (const selector of timeSelectors) {
        const element = $(selector).first();
        if (element.length) {
            const time = element.attr('datetime') ||
                element.attr('pubdate') ||
                element.text().trim();
            if (time) return time;
        }
    }

    // 3. 从常见的日期 class 中提取
    const classSelectors = [
        '.publish-time',
        '.pub-date',
        '.article-date',
        '.post-date',
        '.date',
        '.time',
        '.create-time',
        '.update-time'
    ];

    for (const selector of classSelectors) {
        const text = $(selector).first().text().trim();
        if (text) return text;
    }

    return ''; // 如果都没找到，返回空字符串
}

// 主函数：提取文章信息
async function extractArticleInfo(html, mobileUrl, title = '') {
    const $ = load(html);

    // 1. 提取结构化数据
    const structuredData = extractStructuredData($);

    // 2. 提取文章标题
    const articleTitle = structuredData?.headline?.trim() ||
        $('h1').first().text().trim() ||
        $('title').text().trim().split('_')[0] ||
        title ||
        '未知标题';

    // 3. 提取文章正文
    let articleContent = '';
    const images = [];

    // 优先从结构化数据中获取文章内容
    if (structuredData?.articleBody) {
        articleContent = structuredData.articleBody;
    } else {
        // 从 article 标签提取
        const article = $('article.syl-article-base, article.article, article[class*="article"], .article-content, .content');

        if (article.length > 0) {
            // 清理不需要的标签
            article.find('script, style, iframe, noscript, .comment, .related-news, .recommend, .advertisement').remove();

            // 提取纯文本内容
            articleContent = article.text().trim()
                .replace(/\s+/g, ' ')
                .trim();

            // 提取文章内的图片
            article.find('img').each((_, img) => {
                const $img = $(img);
                const dataSrc = $img.attr('data-src') || $img.attr('data-original');
                const src = $img.attr('src');
                const imgUrl = dataSrc || src;

                if (imgUrl && !imgUrl.startsWith('data:')) {
                    images.push(imgUrl);
                }
            });
        } else {
            // 备用方案：尝试从其他常见内容容器提取
            const contentSelectors = ['.content-body', '.post-content', '.news-content', '.detail-content'];
            for (const selector of contentSelectors) {
                const content = $(selector);
                if (content.length > 0) {
                    articleContent = content.text().trim()
                        .replace(/\s+/g, ' ')
                        .trim();
                    break;
                }
            }
        }
    }

    // 4. 提取图片（合并多个来源）
    const allImages = new Set();

    // 从结构化数据添加图片
    if (structuredData?.image) {
        if (Array.isArray(structuredData.image)) {
            structuredData.image.forEach(img => {
                if (typeof img === 'string' && !img.startsWith('data:')) {
                    allImages.add(img);
                } else if (img?.url && !img.url.startsWith('data:')) {
                    allImages.add(img.url);
                }
            });
        } else if (typeof structuredData.image === 'string' && !structuredData.image.startsWith('data:')) {
            allImages.add(structuredData.image);
        }
    }

    // 添加从文章提取的图片
    images.forEach(img => allImages.add(img));

    // 5. 提取发布时间
    let createTime = '';
    if (structuredData?.datePublished) {
        createTime = structuredData.datePublished;
    } else if (structuredData?.dateModified) {
        createTime = structuredData.dateModified;
    } else {
        createTime = extractPublishTimeFromHtml($);
    }

    // 6. 提取作者信息
    let author = '';
    if (structuredData?.author) {
        if (typeof structuredData.author === 'string') {
            author = structuredData.author;
        } else if (structuredData.author['@type'] === 'Person' ||
            structuredData.author['@type'] === 'Organization') {
            author = structuredData.author.name || '';
        }
    }

    // 7. 构建结果对象
    const result = {
        url: mobileUrl,
        title: articleTitle,
        content: [articleContent],
        create_time: createTime,
        images: Array.from(allImages),
        author: author || '',
        publisher: structuredData?.publisher?.name || '',
        description: structuredData?.description || '',
    };

    return result;
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
