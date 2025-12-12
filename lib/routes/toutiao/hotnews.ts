import { Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
import { parseDate } from '@/utils/parse-date';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import fs from 'fs';
import path from 'path';

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

                //item.articleContent = articleContent;
                items.push({
                    title: `${i + 1}. ${title}`,
                    description: item, // 使用获取到的内容
                    pubDate: parseDate(new Date()),
                    guid: `toutiao-hot-${item.ClusterIdStr || i}-${Date.now()}`,
                    category: item.InterestCategory,
                });
            }
            // const articleContent = await getArticleContent(items[0].description.Url, items[0].description.Title);
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
                        guid: `toutiao-fixed-${item.ClusterIdStr || i}-${Date.now()}`,
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

/**
 * 获取文章详细内容（纯文本）
 * @param url 文章链接
 * @param title 文章标题（用于搜索备用）
 * @returns 文章内容对象（纯文本）
 */
async function getArticleContent(url: string, title?: string): Promise<ArticleContent> {
    const baseUrl = 'https://www.toutiao.com';
    const mobileBaseUrl = 'https://m.toutiao.com';

    try {
        console.log(`获取文章内容: ${url}`);

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
                const filename = `article_${articleId}`;
                saveHtmlForDebug(html, filename, 'article');
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

                    return {
                        url: mobileUrl,
                        title: articleTitle,
                        content: plainText,
                        images
                    };
                }
            }
        }

        // 如果不是文章链接或者没有找到内容，使用搜索页面
        console.log(`使用搜索页面获取内容: ${title}`);
        const searchUrl = `https://so.toutiao.com/search?keyword=${encodeURIComponent(title || '热点')}`;

        const html = await ofetch(searchUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Referer': baseUrl,
            },
        });
        console.log('ssssss', html);
        const filename = `seach_${title}`;
        saveHtmlForDebug(html, filename, 'seach');
        const $ = load(html);

        // 查找包含热点数据的脚本标签
        const scriptTags = $('script[data-for="ala-data"]');

        for (const script of scriptTags) {
            const scriptContent = $(script).html();
            if (scriptContent && scriptContent.includes('window.T && T.flow')) {
                try {
                    // 提取 JSON 数据
                    const jsonMatch = scriptContent.match(/data:\s*({[^}]+})/);

                    console.log('sss1', jsonMatch);
                    if (jsonMatch && jsonMatch[1]) {
                        const jsonStr = jsonMatch[1];
                        const data = JSON.parse(jsonStr);
                        console.log('sss2', data);
                        // 提取内容
                        let plainText = '';
                        if (data.display) {
                            plainText = data.display.top_content.abstract || data.display.top_content.rich_content
                        }

                        // 清理文本
                        plainText = plainText
                            .replace(/<[^>]*>/g, '')
                            .replace(/\s+/g, ' ')
                            .trim();

                        return {
                            url: url,
                            title: data.title || title || '未知标题',
                            content: plainText,
                            images: data.images ? data.images.map((img: any) => img.url).filter(Boolean) : []
                        };
                    }
                } catch (e) {
                    console.log('解析脚本数据失败:', e.message);
                }
            }
        }

        // 如果找不到脚本数据，尝试从页面中提取摘要
        const summary = $('.summary, .abstract, .content').first().text().trim();
        if (summary) {
            const cleanSummary = summary
                .replace(/\s+/g, ' ')
                .trim();

            return {
                url: searchUrl,
                title: title || $('title').text().trim().split('_')[0] || '未知标题',
                content: cleanSummary,
                images: []
            };
        }

        // 返回默认内容
        return {
            url: searchUrl,
            title: title || '未知标题',
            content: '',
            images: []
        };

    } catch (error) {
        console.error(`获取文章内容失败 (${url}):`, error.message);
        return {
            url: url,
            title: title || '未知标题',
            content: '',
            images: []
        };
    }
}

function saveHtmlForDebug(html: string, filename: string, type: 'article' | 'search') {
    try {
        const debugDir = path.join(__dirname, '../../debug');
        const timestamp = new Date().getTime();

        // 确保目录存在
        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, {recursive: true});
        }

        // 保存原始 HTML
        const htmlFilename = `${timestamp}_${type}_${filename}.html`;
        const htmlPath = path.join(debugDir, htmlFilename);
        fs.writeFileSync(htmlPath, html, 'utf-8');
        console.log(`已保存 HTML 到: ${htmlPath}`);

        // 保存解析后的信息
        const info = {
            type,
            filename,
            timestamp,
            url: filename,
            savedAt: new Date().toISOString(),
            fileSize: html.length
        };

        const infoPath = path.join(debugDir, `${timestamp}_${type}_${filename}_info.json`);
        fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8');

    } catch (error) {
        console.error('保存调试文件失败:', error.message);
    }
}
