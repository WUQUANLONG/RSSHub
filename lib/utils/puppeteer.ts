import { config } from '@/config';
import puppeteer, { Browser, Page } from 'rebrowser-puppeteer';
import logger from './logger';
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

    let currentProxy = proxy.getCurrentProxy();

    if (shouldUseProxy) {
        logger.info('Puppeteer browser requires proxy, attempting to get proxy server');

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
                            logger.info(`Using dynamic proxy: ${dynamicProxyResult.uri}`);
                            currentProxy = {
                                uri: dynamicProxyResult.uri,
                                isActive: true,
                                failureCount: 0,
                                urlHandler: dynamicProxyResult.urlHandler,
                                isDynamic: true,
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

            // Handle proxy authentication
            if (currentProxy.urlHandler?.username || currentProxy.urlHandler?.password) {
                // Only HTTP proxies with authentication need to be anonymized
                if (currentProxy.urlHandler.protocol === 'http:') {
                    try {
                        const anonymizedProxy = await anonymizeProxy(currentProxy.uri);
                        options.args.push(`--proxy-server=${anonymizedProxy}`);

                        logger.info(`Using anonymized proxy for puppeteer browser: ${anonymizedProxy}`);
                    } catch (error) {
                        logger.error('Failed to anonymize proxy:', error);
                    }
                } else {
                    logger.warn('SOCKS/HTTPS proxy with authentication is not supported by puppeteer, continue without proxy');
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

                    logger.info(`Using proxy ${currentProxy.uri} for puppeteer browser`);
                    logger.info(`Proxy connection details - Host: ${host}, Port: ${port}, Protocol: ${protocol}`);
                } catch (error) {
                    logger.error('Failed to set up proxy for puppeteer browser:', error);
                }
            }
        }
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

    // If we have authentication credentials, create a page and authenticate
    if (currentProxy && currentProxy.urlHandler?.username && currentProxy.urlHandler?.password) {
        try {
            const page = await browser.newPage();
            await page.authenticate({
                username: currentProxy.urlHandler.username,
                password: currentProxy.urlHandler.password,
            });
            logger.debug(`Authenticated with proxy ${currentProxy.uri}`);

            // Close the page as it's just for authentication
            await page.close();
        } catch (authError) {
            logger.error('Failed to authenticate with proxy:', authError);
            // Don't throw here as we want to continue with the browser instance
        }
    }

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
                           instanceOptions.retryCount > 0 ||
                           (instanceOptions.headers && (instanceOptions.headers as Record<string, string>)['x-prefer-proxy'] === '1');

    let hasProxy = false;
    let currentProxyState: any = null;
    let currentProxy = proxy.getCurrentProxy();

    if (shouldUseProxy) {
        logger.info('Puppeteer request requires proxy, attempting to get proxy server');

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
                            logger.info(`Using dynamic proxy: ${dynamicProxyResult.uri}`);
                            currentProxy = {
                                uri: dynamicProxyResult.uri,
                                isActive: true,
                                failureCount: 0,
                                urlHandler: dynamicProxyResult.urlHandler,
                                isDynamic: true,
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

            // Extract protocol from proxy URL
            const protocol = currentProxy.uri.startsWith('https') ? 'https' : 'http';
            const [host, port] = currentProxy.uri.replace(/^https?:\/\//, '').split(':');

            // Set up proxy configuration using HttpAgent
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

                logger.info(`Using proxy ${currentProxy.uri} for puppeteer request ${url}`);
                logger.info(`Proxy connection details - Host: ${host}, Port: ${port}, Protocol: ${protocol}`);
            } catch (error) {
                logger.error('Failed to set up proxy for puppeteer request:', error);
            }
        }
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

    if (hasProxy && currentProxyState) {
        logger.debug(`Proxying request in puppeteer via ${currentProxyState.uri}: ${url}`);
    }

    if (hasProxy && currentProxyState && (currentProxyState.urlHandler?.username || currentProxyState.urlHandler?.password)) {
        await page.authenticate({
            username: currentProxyState.urlHandler?.username,
            password: currentProxyState.urlHandler?.password,
        });
    }

    if (instanceOptions.onBeforeLoad) {
        await instanceOptions.onBeforeLoad(page, browser);
    }

    if (!instanceOptions.noGoto) {
        try {
            await page.goto(url, instanceOptions.gotoConfig || { waitUntil: 'domcontentloaded' });
        } catch (error) {
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

                // For non-retry attempts, re-throw to allow caller to retry if needed
                throw error;
            }
            throw error;
        }
    }

    return {
        page,
        destory: async () => {
            await browser.close();
        },
        browser,
    };
};
