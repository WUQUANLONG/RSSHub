import { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import { getPuppeteerPage } from '@/utils/puppeteer';
import cache from '@/utils/cache';
import logger from '@/utils/logger';

// 导入本地工具
import { get_md5_1038 } from './md5_utils';

export const route: Route = {
    path: '/livenews/:max_id?',
    categories: ['finance'],
    example: '/xueqiu/livenews',
    parameters: {
        max_id: {
            description: '分页参数，从上一页的 next_max_id 获取',
            type: 'string',
            required: false,
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: true,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['xueqiu.com/'],
            target: '/livenews',
        },
    ],
    name: '7x24 新闻',
    maintainers: ['your-username'],
    handler,
};

async function handler(ctx) {
    const { max_id } = ctx.req.param();
    const rootUrl = 'https://xueqiu.com';

    // 使用 Puppeteer 获取完整的 cookies 和 WAF token
    const { wafToken, cookies, userAgent } = await getDataWithPuppeteer();

    // logger.info('获取到 WAF token:', wafToken.substring(0, 30) + '...');
    // logger.info('获取到 cookies 数量:', cookies.split(';').length);

    // 生成随机字符串 (16位)
    const randomString = generateRandomString(16);

    // 构建基础请求路径
    let apiPath = '/statuses/livenews/list.json?count=15';
    if (max_id) {
        apiPath += `&max_id=${max_id}`;
    } else {
        apiPath += '&max_id=';
    }

    // 生成包含 md5__1038 参数的完整 URL
    const fullUrlWithMd5 = get_md5_1038(
        wafToken,
        randomString,
        apiPath,
        'GET'
    );

    logger.info(`生成的完整 URL: ${fullUrlWithMd5}`);

    // 发送请求
    const response = await got({
        method: 'get',
        url: fullUrlWithMd5,
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Connection': 'keep-alive',
            'Cookie': cookies,
            'Host': 'xueqiu.com',
            'Referer': rootUrl,
            'User-Agent': userAgent,
            'X-Requested-With': 'XMLHttpRequest',
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
        },
        agent: false,
        timeout: 30000,
    });

    // logger.info('响应状态码:', response.statusCode);

    // 解析响应数据
    let data;
    try {
        data = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    } catch (error) {
        logger.error('解析 JSON 失败:', error);
        logger.error('响应内容:', response.body.substring(0, 500));
        throw new Error('API 返回数据格式错误');
    }

    if (!data || !Array.isArray(data.items)) {
        logger.error('API 返回数据格式错误:', data);
        throw new Error('API 返回数据格式错误');
    }

    logger.info('获取到数据项数量:', data.items.length);

    // 处理数据项
    const items = data.items.map((item) => {
        // 构建新闻链接
        let link;
        if (item.target) {
            link = item.target;
        } else if (item.status_id) {
            link = `${rootUrl}/status/${item.status_id}`;
        } else {
            link = `${rootUrl}/`;
        }

        // 处理新闻文本
        const text = item.text || '';
        const title = text.length > 100 ? text.substring(0, 100) + '...' : text || `新闻 ${item.id}`;

        // 格式化发布时间
        let pubDate;
        if (item.created_at) {
            pubDate = parseDate(item.created_at);
        }

        return {
            title,
            description: `
                <p>${text.replace(/\n/g, '<br>')}</p>
                ${pubDate ? `<p><small>发布时间: ${pubDate.toLocaleString()}</small></p>` : ''}
            `,
            link,
            pubDate,
            author: '雪球财经',
            guid: item.id,
            id: item.id,
        };
    });

    // 构建返回结果
    const result: any = {
        title: '雪球 7x24 新闻',
        link: `${rootUrl}/`,
        description: '雪球财经 7x24 小时新闻快讯',
        item: items,
    };

    // 如果有下一页，添加 next_max_id 信息
    if (data.next_max_id) {
        result.next_max_id = data.next_max_id;
    }

    return result;
}

/**
 * 使用 Puppeteer 获取完整的数据
 */
async function getDataWithPuppeteer(): Promise<{ wafToken: string; cookies: string; userAgent: string }> {
    return await cache.tryGet(
        'xueqiu:puppeteer_data',
        async () => {
            let browser: Browser | undefined;
            let page: Page | undefined;

            try {
                // 使用封装的 getPuppeteerPage 函数，它会自动处理代理
                const result = await getPuppeteerPage('https://xueqiu.com', {
                    gotoConfig: {
                        waitUntil: 'domcontentloaded'
                    }
                });

                page = result.page;
                browser = result.browser;

                // 设置 User-Agent（如果需要覆盖默认值）
                const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                await page.setUserAgent(userAgent);

                // 设置额外的头信息
                await page.setExtraHTTPHeaders({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                });

                logger.info('正在访问雪球首页，执行 JavaScript 挑战...');

                // 重新导航以确保使用新的UA和headers
                await page.reload({
                    waitUntil: 'domcontentloaded'
                });

                // 等待页面加载 - 增加等待时间
                await new Promise(resolve => setTimeout(resolve, 5000));

                // 等待可能的动态加载
                try {
                    await page.waitForSelector('body', { timeout: 10000 });
                    logger.info('成功找到 body 元素');
                } catch (error) {
                    logger.info('等待 body 超时，继续执行...');
                }

                // 再次等待确保 JavaScript 执行完成
                await new Promise(resolve => setTimeout(resolve, 3000));

                // 获取页面内容以调试
                const pageContent = await page.content();
                logger.info('页面加载完成，HTML 长度:', pageContent.length);

                // 检查页面是否包含雪球内容
                if (pageContent.length < 1000) {
                    logger.error('页面内容过少，可能未正确加载');
                    logger.error('页面内容:', pageContent);
                    throw new Error('页面加载失败，内容过少');
                }

                // 检查是否有 WAF 挑战
                if (pageContent.includes('waf') || pageContent.includes('_waf')) {
                    logger.info('检测到 WAF 相关关键词');
                }

                // 获取 WAF token
                const wafToken = await page.evaluate(() => {
                    try {
                        // 从 textarea#renderData 中提取
                        const textarea = document.getElementById('renderData');
                        if (textarea && textarea.textContent) {
                            const data = JSON.parse(textarea.textContent);
                            return data._waf_bd8ce2ce37 || '';
                        }

                        // 备用方法：从 window 对象获取
                        if ((window as any)._waf_bd8ce2ce37) {
                            return (window as any)._waf_bd8ce2ce37;
                        }

                        // 尝试从 script 标签中查找
                        const scripts = document.getElementsByTagName('script');
                        for (let i = 0; i < scripts.length; i++) {
                            const scriptContent = scripts[i].textContent || '';
                            if (scriptContent.includes('_waf_bd8ce2ce37')) {
                                const match = scriptContent.match(/_waf_bd8ce2ce37["']?\s*:\s*["']([^"']+)["']/);
                                if (match && match[1]) {
                                    return match[1];
                                }
                            }
                        }

                        return '';
                    } catch (error) {
                        console.error('提取 WAF token 失败:', error);
                        return '';
                    }
                });

                let finalWafToken = wafToken;

                if (!finalWafToken) {
                    // 尝试从页面 HTML 中提取
                    const extractedToken = extractWafTokenFromHTML(pageContent);
                    if (extractedToken) {
                        finalWafToken = extractedToken;
                        logger.info('从 HTML 中提取到 WAF token');
                    } else {
                        logger.warn('无法从页面提取 WAF token');
                        // 可以设置一个默认值或继续尝试其他方法
                    }
                }

                // 获取 cookies
                const cookies = await page.cookies();
                const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

                logger.info('成功获取数据 via Puppeteer');
                logger.info('WAF token:', finalWafToken ? finalWafToken.substring(0, 30) + '...' : '未找到');
                logger.info('Cookies 数量:', cookies.length);
                logger.info('示例 cookies:', cookieString.substring(0, 200) + '...');

                return {
                    wafToken: finalWafToken || '',
                    cookies: cookieString,
                    userAgent,
                };

            } catch (error) {
                logger.error('Puppeteer 执行失败:', error);
                throw error;
            } finally {
                // 正确清理资源
                try {
                    if (browser) {
                        await browser.close();
                        logger.info('成功关闭 Puppeteer 浏览器');
                    }
                } catch (cleanupError) {
                    logger.warn('清理 Puppeteer 资源时出错:', cleanupError);
                }
            }
        },
        1800, // 缓存30分钟
        false
    );
}

/**
 * 从 HTML 中提取 WAF token
 */
function extractWafTokenFromHTML(html: string): string {
    try {
        // 方法1：从 textarea#renderData 中提取
        const textareaRegex = /<textarea[^>]*id="renderData"[^>]*>([\s\S]*?)<\/textarea>/i;
        const match = html.match(textareaRegex);

        if (match && match[1]) {
            try {
                const data = JSON.parse(match[1].trim());
                return data._waf_bd8ce2ce37 || '';
            } catch (error) {
                logger.warn('解析 renderData 失败:', error);
            }
        }

        // 方法2：直接从 HTML 中搜索
        const directRegex = /"_waf_bd8ce2ce37":"([^"]+)"/;
        const directMatch = html.match(directRegex);
        if (directMatch) {
            return directMatch[1];
        }

        return '';
    } catch (error) {
        logger.error('提取 WAF token 失败:', error);
        return '';
    }
}

// 生成随机字符串
function generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    try {
        const crypto = require('crypto');
        const randomBytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            result += chars[randomBytes[i] % chars.length];
        }
    } catch (error) {
        for (let i = 0; i < length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
    }

    return result;
}
