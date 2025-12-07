import { config } from '@/config';
import puppeteer, { Browser, Page } from 'rebrowser-puppeteer';
import logger, { maskProxyUri, proxyInfo, proxyError } from './logger';
import proxy from './proxy';
import { anonymizeProxy } from 'proxy-chain';
import { HttpsAgent as HttpAgent } from 'agentkeepalive';

/**
 * @deprecated use getPage instead
 * @returns Puppeteer browser
 */
const outPuppeteer = async () => {
    const options = {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            `--user-agent=${config.ua}`,
        ],
        headless: true,
        ignoreHTTPSErrors: true,
    };

    const insidePuppeteer: typeof puppeteer = puppeteer;

    // Check if we should use a proxy for this request
    const shouldUseProxy = config.proxy.strategy === 'all';

    if (shouldUseProxy) {
        logger.info('Puppeteer browser requires proxy, attempting to get proxy server');

        let currentProxy = proxy.getCurrentProxy();

        // For dynamic proxies that are still initializing or need refresh
        if (currentProxy?.isDynamic && !currentProxy.uri) {
            // If we have a dynamic proxy function, call it to get the promise
            if ((proxy as any).dynamicProxyPromise && typeof (proxy as any).dynamicProxyPromise === 'function') {
                try {
                    const dynamicProxyPromiseFunc = (proxy as any).dynamicProxyPromise;
                    const dynamicProxy = await dynamicProxyPromiseFunc();
                    if (dynamicProxy) {
                        const dynamicProxyResult = await dynamicProxy.getProxy();
                        if (dynamicProxyResult) {
                            logger.info(`Using dynamic proxy: ${maskProxyUri(dynamicProxyResult.uri)}`);
                            currentProxy = {
                                uri: dynamicProxyResult.uri,
                                isActive: true,
                                failureCount: 0,
                                urlHandler: dynamicProxyResult.urlHandler,
                                isDynamic: true,
                                // 确保用户名和密码传递
                                username: dynamicProxyResult.username || dynamicProxyResult.urlHandler?.username,
                                password: dynamicProxyResult.password || dynamicProxyResult.urlHandler?.password,
                            };
                        }
                    }
                } catch (error) {
                    logger.error('Error getting dynamic proxy:', error);
                }
            }

            // If we still don't have a proxy, fail fast
            if (!currentProxy?.uri) {
                logger.error('Failed to obtain dynamic proxy server - aborting request');
                throw new Error('Dynamic proxy server unavailable: failed to obtain proxy from service');
            }
        }

        // For non-dynamic proxies, proceed as normal
        if (currentProxy && currentProxy.uri) {
            // Extract protocol from proxy URL
            const protocol = currentProxy.uri.startsWith('https') ? 'https' : 'http';
            const [host, port] = currentProxy.uri.replace(/^https?:\/\//, '').split(':');

            // 检查是否有用户名和密码
            const username = currentProxy.username || currentProxy.urlHandler?.username;
            const password = currentProxy.password || currentProxy.urlHandler?.password;

            // 构建代理URL
            let proxyUrl;
            if (username && password) {
                // 对于需要认证的代理，将认证信息嵌入URL
                proxyUrl = `${protocol}://${username}:${password}@${host}:${port}`;
                logger.debug(`Using authenticated proxy: ${protocol}://${username}:***@${host}:${port}`);
            } else {
                // 不需要认证的代理
                proxyUrl = `${protocol}://${host}:${port}`;
                logger.debug(`Using proxy without auth: ${proxyUrl}`);
            }

            // Handle proxy authentication
            if (username || password) {
                // Only HTTP proxies with authentication need to be anonymized
                if (protocol === 'http') {
                    try {
                        const anonymizedProxy = await anonymizeProxy(proxyUrl);
                        options.args.push(`--proxy-server=${anonymizedProxy}`);

                        logger.info(`Using anonymized proxy for puppeteer browser: ${anonymizedProxy}`);
                    } catch (error) {
                        logger.error('Failed to anonymize proxy:', error);
                        // 如果匿名化失败，直接使用带认证的代理URL
                        options.args.push(`--proxy-server=${proxyUrl}`);
                    }
                } else {
                    // HTTPS/SOCKS 代理直接使用带认证的URL
                    options.args.push(`--proxy-server=${proxyUrl}`);
                    logger.info(`Using authenticated HTTPS/SOCKS proxy for puppeteer browser`);
                }
            } else {
                // For proxies without authentication, set up using HttpAgent
                try {
                    const httpAgent = new HttpAgent({
                        host,
                        port: Number.parseInt(port),
                        maxSockets: 50,
                        maxFreeSockets: 10,
                        timeout: 60000,
                        freeSocketTimeout: 30000,
                    });

                    // Configure puppeteer to use the proxy
                    options.args.push(`--proxy-server=${host}:${port}`);

                    logger.info(`Using proxy ${maskProxyUri(currentProxy.uri)} for puppeteer browser`);
                    logger.info(`Proxy connection details - Host: ${host}, Port: ${port}, Protocol: ${protocol}`);
                } catch (error) {
                    logger.error('Failed to set up proxy for puppeteer browser:', error);
                }
            }
        } else {
            logger.warn('Should use proxy but no proxy available, proceeding without proxy');
        }
    } else {
        // 不需要代理的情况
        logger.info('Puppeteer browser will run without proxy');
    }

    const browser = await (config.puppeteerWSEndpoint
        ? insidePuppeteer.connect({
            browserWSEndpoint: config.puppeteerWSEndpoint,
        })
        : insidePuppeteer.launch(
            config.chromiumExecutablePath
                ? {
                    executablePath: config.chromiumExecutablePath,
                    ...options,
                }
                : options
        ));

    // 移除了 page.authenticate() 的调用，因为认证信息已经在代理URL中

    setTimeout(async () => {
        await browser.close();
    }, 30000);

    return browser;
};

export default outPuppeteer;

/**
 * @returns Puppeteer page
 */
export const getPuppeteerPage = async (
    url: string,
    instanceOptions: {
        onBeforeLoad?: (page: Page, browser?: Browser) => Promise<void> | void;
        gotoConfig?: {
            waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
        };
        noGoto?: boolean;
        retryCount?: number;
        headers?: Record<string, string>;
    } = {}
) => {
    const options = {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            `--user-agent=${config.ua}`,
        ],
        headless: true,
        ignoreHTTPSErrors: true,
    };

    const insidePuppeteer: typeof puppeteer = puppeteer;

    // Check if we should use a proxy for this request
    const shouldUseProxy = config.proxy.strategy === 'all' ||
        (instanceOptions.retryCount && instanceOptions.retryCount > 0) ||
        (instanceOptions.headers && instanceOptions.headers['x-prefer-proxy'] === '1');

    let hasProxy = false;
    let currentProxyState: any = null;

    if (shouldUseProxy) {
        logger.info('Puppeteer request requires proxy, attempting to get proxy server');

        let currentProxy = proxy.getCurrentProxy();

        // For dynamic proxies that are still initializing or need refresh
        if (currentProxy?.isDynamic && !currentProxy.uri) {
            // If we have a dynamic proxy function, call it to get the promise
            if ((proxy as any).dynamicProxyPromise && typeof (proxy as any).dynamicProxyPromise === 'function') {
                try {
                    const dynamicProxyPromiseFunc = (proxy as any).dynamicProxyPromise;
                    const dynamicProxy = await dynamicProxyPromiseFunc();
                    if (dynamicProxy) {
                        const dynamicProxyResult = await dynamicProxy.getProxy();
                        if (dynamicProxyResult) {
                            logger.info(`Using dynamic proxy: ${maskProxyUri(dynamicProxyResult.uri)}`);
                            currentProxy = {
                                uri: dynamicProxyResult.uri,
                                isActive: true,
                                failureCount: 0,
                                urlHandler: dynamicProxyResult.urlHandler,
                                isDynamic: true,
                                // 确保用户名和密码传递
                                username: dynamicProxyResult.username || dynamicProxyResult.urlHandler?.username,
                                password: dynamicProxyResult.password || dynamicProxyResult.urlHandler?.password,
                            };
                        }
                    }
                } catch (error) {
                    logger.error('Error getting dynamic proxy:', error);
                }
            }

            // If we still don't have a proxy, fail fast
            if (!currentProxy?.uri) {
                logger.error('Failed to obtain dynamic proxy server - aborting request');
                throw new Error('Dynamic proxy server unavailable: failed to obtain proxy from service');
            }
        }

        // For non-dynamic proxies, proceed as normal
        if (currentProxy && currentProxy.uri) {
            currentProxyState = currentProxy;
            hasProxy = true;

            // 解析代理URL
            let proxyUrl = currentProxy.uri;
            let protocol = 'http';
            let host = '';
            let port = '';
            let username = '';
            let password = '';

            try {
                const proxyUrlObj = new URL(currentProxy.uri);
                protocol = proxyUrlObj.protocol.replace(':', '');
                host = proxyUrlObj.hostname;
                port = proxyUrlObj.port;
                username = proxyUrlObj.username || currentProxy.username || '';
                password = proxyUrlObj.password || currentProxy.password || '';

                // 如果没有端口，设置默认端口
                if (!port) {
                    port = protocol === 'https' ? '443' : '80';
                }

                logger.debug(`Parsed proxy: ${protocol}://${username ? username + ':***' : ''}@${host}:${port}`);
            } catch (error) {
                logger.error('Failed to parse proxy URL:', error);
                throw new Error(`Invalid proxy URL: ${currentProxy.uri}`);
            }

            // 存储认证信息到 currentProxyState，以便后续使用
            if (username || password) {
                currentProxyState.auth = { username, password };
            }

            // 处理不同类型的代理
            if (protocol === 'http' || protocol === 'https') {
                // 对于HTTP/HTTPS代理，检查是否需要认证
                if (username || password) {
                    // 对于需要认证的HTTP代理，使用 anonymizeProxy
                    if (protocol === 'http') {
                        try {
                            // 构建带认证的代理URL
                            const authProxyUrl = username && password
                                ? `${protocol}://${username}:${password}@${host}:${port}`
                                : `${protocol}://${host}:${port}`;

                            logger.info(`Anonymizing proxy: ${protocol}://${username}:***@${host}:${port}`);

                            // 使用 proxy-chain 的 anonymizeProxy 创建本地代理
                            const anonymizedProxy = await anonymizeProxy(authProxyUrl);

                            // 解析匿名化后的代理URL（应该是 http://127.0.0.1:xxxxx 格式）
                            const anonymizedUrl = new URL(anonymizedProxy);
                            const anonymizedHost = anonymizedUrl.hostname;
                            const anonymizedPort = anonymizedUrl.port;

                            // 使用匿名化后的代理（不带认证信息）
                            options.args.push(`--proxy-server=${anonymizedHost}:${anonymizedPort}`);

                            logger.info(`Using anonymized proxy: ${anonymizedHost}:${anonymizedPort} for puppeteer request`);
                            logger.info(`Original proxy: ${username}:***@${host}:${port}`);

                            // 标记为已匿名化，不需要额外的认证
                            currentProxyState.anonymized = true;

                        } catch (error) {
                            logger.error('Failed to anonymize proxy, trying direct approach:', error);

                            // 如果匿名化失败，尝试直接使用代理
                            const proxyServer = `${host}:${port}`;
                            options.args.push(`--proxy-server=${proxyServer}`);
                            logger.info(`Using direct proxy: ${proxyServer} (will authenticate via page.authenticate)`);
                        }
                    } else {
                        // HTTPS代理，直接使用
                        const proxyServer = `${host}:${port}`;
                        options.args.push(`--proxy-server=${proxyServer}`);
                        logger.info(`Using HTTPS proxy: ${proxyServer} for puppeteer request`);
                    }
                } else {
                    // 不需要认证的代理
                    const proxyServer = `${host}:${port}`;
                    options.args.push(`--proxy-server=${proxyServer}`);
                    logger.info(`Using proxy without auth: ${proxyServer} for puppeteer request`);
                }
            } else {
                // SOCKS代理或其他类型
                options.args.push(`--proxy-server=${currentProxy.uri}`);
                logger.info(`Using proxy: ${maskProxyUri(currentProxy.uri)} for puppeteer request`);
            }

            logger.info(`Proxy connection details - Host: ${host}, Port: ${port}, Protocol: ${protocol}`);
        } else {
            logger.warn('Should use proxy but no proxy available, proceeding without proxy');
        }
    } else {
        // 不需要代理的情况
        logger.info('Puppeteer request will run without proxy');
    }

    let browser: Browser;
    if (config.puppeteerWSEndpoint) {
        const endpointURL = new URL(config.puppeteerWSEndpoint);
        endpointURL.searchParams.set('launch', JSON.stringify(options));
        endpointURL.searchParams.set('stealth', 'true');
        const endpoint = endpointURL.toString();
        browser = await insidePuppeteer.connect({
            browserWSEndpoint: endpoint,
        });
    } else {
        browser = await insidePuppeteer.launch(
            config.chromiumExecutablePath
                ? {
                    executablePath: config.chromiumExecutablePath,
                    ...options,
                }
                : options
        );
    }

    setTimeout(async () => {
        await browser.close();
    }, 30000);

    const page = await browser.newPage();

    // 设置代理认证（如果需要且没有使用匿名化代理）
    if (hasProxy && currentProxyState?.auth && !currentProxyState?.anonymized) {
        try {
            await page.authenticate({
                username: currentProxyState.auth.username,
                password: currentProxyState.auth.password,
            });
            logger.info(`Set proxy authentication for ${url} (username: ${currentProxyState.auth.username})`);
        } catch (authError) {
            logger.error('Failed to authenticate proxy:', authError);
        }
    }

    if (instanceOptions.onBeforeLoad) {
        await instanceOptions.onBeforeLoad(page, browser);
    }

    if (!instanceOptions.noGoto) {
        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount <= maxRetries) {
            try {
                await page.goto(url, {
                    ...(instanceOptions.gotoConfig || { waitUntil: 'domcontentloaded' }),
                    timeout: 30000, // 增加超时时间
                });
                break; // 成功则退出循环
            } catch (error) {
                retryCount++;

                if (retryCount > maxRetries) {
                    // Handle proxy-related errors
                    if (hasProxy && currentProxyState) {
                        logger.warn(`Puppeteer navigation failed with proxy ${currentProxyState.uri}, marking as failed: ${error}`);

                        // Mark the proxy as failed if we're using multiProxy mode
                        if (proxy.multiProxy) {
                            proxy.markProxyFailed(currentProxyState.uri);
                        }

                        // If this was a retry attempt, don't retry again
                        if (instanceOptions.retryCount && instanceOptions.retryCount > 0) {
                            throw error;
                        }
                    }
                    throw error;
                }

                logger.warn(`导航失败，第 ${retryCount} 次重试: ${error}`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒后重试
            }
        }
    }

    return {
        page,
        destroy: async () => {  // 确保这里是 "destroy"
            await browser.close();
        },
        browser,
    };
};
