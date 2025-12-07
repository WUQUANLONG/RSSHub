import { getPuppeteerPage } from '@/utils/puppeteer';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
/**
 * 使用 Puppeteer 获取完整的数据
 */
export async function getDataWithPuppeteer(): Promise<{ wafToken: string; cookies: string; userAgent: string }> {
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
        120, // 缓存30分钟
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
export function generateRandomString(length: number): string {
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

/**
 * 专门为搜索 API 获取 Cookie
 */
/**
 * 专门为搜索 API 获取 Cookie
 */
export async function getSearchApiCookies(): Promise<{ cookies: string; userAgent: string }> {
    const cacheKey = 'xueqiu:search_api_cookies';

    return await cache.tryGet(
        cacheKey,
        async () => {
            let browser: Browser | undefined;
            let page: Page | undefined;

            try {
                logger.info('开始为搜索 API 获取 Cookie...');

                // 访问一个实际的搜索页面
                const searchUrl = 'https://xueqiu.com/k';
                const result = await getPuppeteerPage(searchUrl, {
                    gotoConfig: {
                        waitUntil: 'networkidle2',
                        timeout: 60000
                    }
                });

                page = result.page;
                browser = result.browser;

                // 设置 User-Agent
                const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
                await page.setUserAgent(userAgent);

                // 等待页面加载 - 使用兼容方法
                await new Promise(resolve => setTimeout(resolve, 8000));

                // 监听网络请求
                const apiRequests: Array<{url: string, headers: any}> = [];

                // 监听请求
                page.on('request', (request) => {
                    const url = request.url();
                    if (url.includes('/query/v1/search/status.json')) {
                        logger.info(`监听到搜索 API 请求: ${url}`);
                        const headers = request.headers();
                        apiRequests.push({
                            url,
                            headers
                        });
                    }
                });

                // 触发滚动以加载更多内容
                await page.evaluate(() => {
                    window.scrollTo(0, 300);
                });

                // 再次等待
                await new Promise(resolve => setTimeout(resolve, 3000));

                // 获取 cookies
                const cookies = await page.cookies();
                logger.info(`获取到 ${cookies.length} 个 cookies`);

                // 检查是否有监听到的 API 请求
                if (apiRequests.length > 0) {
                    const lastRequest = apiRequests[apiRequests.length - 1];
                    const cookieHeader = lastRequest.headers['cookie'];
                    if (cookieHeader) {
                        logger.info('API 请求头中的 Cookie (前200字符):', cookieHeader.substring(0, 200));

                        // 比较页面的 cookies 和请求头的 cookies
                        const pageCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                        logger.info('页面 Cookies 数量:', cookies.length);
                        logger.info('请求头 Cookies 数量:', cookieHeader.split(';').length);
                    }
                }

                // 构建完整的 cookie 字符串
                let cookieString = cookies
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(cookie => `${cookie.name}=${cookie.value}`)
                    .join('; ');

                // 尝试从监听到的请求中获取更准确的 Cookie
                if (apiRequests.length > 0) {
                    const lastRequest = apiRequests[apiRequests.length - 1];
                    const requestCookie = lastRequest.headers['cookie'];
                    if (requestCookie && requestCookie.length > cookieString.length) {
                        logger.info('使用请求头中的 Cookie（可能更完整）');
                        cookieString = requestCookie;
                    }
                }

                // 验证关键 Cookie 是否存在
                const requiredCookies = [
                    { name: 'xq_a_token', desc: '认证 token' },
                    { name: 'xq_id_token', desc: 'ID token' },
                    { name: 'device_id', desc: '设备 ID' },
                    { name: 'cookiesu', desc: '用户标识' },
                    { name: 'acw_tc', desc: '反爬 token' },
                ];

                const cookieMap = new Map(cookies.map(c => [c.name, c.value]));

                requiredCookies.forEach(({ name, desc }) => {
                    const value = cookieMap.get(name);
                    if (value) {
                        logger.info(`✅ ${desc} (${name}): ${value.substring(0, 30)}...`);
                    } else {
                        logger.warn(`❌ 缺少 ${desc} (${name})`);
                    }
                });

                // 统计不同类型的 Cookie
                const cookieTypes = {
                    auth: cookies.filter(c => c.name.includes('token')).length,
                    device: cookies.filter(c => c.name.includes('device') || c.name.includes('bid')).length,
                    session: cookies.filter(c => c.name.includes('session') || c.name.includes('smid')).length,
                    tracking: cookies.filter(c => c.name.startsWith('__') || c.name.includes('hm_')).length,
                    waf: cookies.filter(c => c.name.includes('waf') || c.name.includes('acw')).length,
                };

                logger.info('Cookie 类型统计:', cookieTypes);

                return {
                    cookies: cookieString,
                    userAgent,
                };

            } catch (error) {
                logger.error('获取搜索 API Cookie 失败:', error);

                // 尝试保存错误信息用于调试
                if (page) {
                    try {
                        const pageContent = await page.content();
                        if (pageContent.length > 100) {
                            const fs = require('fs');
                            fs.writeFileSync('xueqiu_cookie_error.html', pageContent);
                            logger.info('已保存错误页面内容到 xueqiu_cookie_error.html');
                        }
                    } catch (e) {
                        logger.warn('保存错误页面失败:', e);
                    }
                }

                throw error;
            } finally {
                if (browser) {
                    try {
                        await browser.close();
                        logger.info('已关闭浏览器');
                    } catch (error) {
                        logger.warn('关闭浏览器时出错:', error);
                    }
                }
            }
        },
        5 * 60, // 5分钟缓存
        false
    );
}
