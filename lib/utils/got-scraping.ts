import proxy from '@/utils/proxy';
import logger, { maskProxyUri } from '@/utils/logger';
import { config } from '@/config';

const getGotScraping = (defaultOptions?: any) => {
    const instance = async (url: any, options?: any) => {
        // 1. 动态加载模块
        const { gotScraping } = await import('got-scraping');

        let requestUrl = typeof url === 'string' ? url : url.url;
        const inputOptions = typeof url === 'string' ? options : url;

        const mergedOptions = {
            ...defaultOptions,
            ...inputOptions,
        };

        // --- 代理获取逻辑 (对齐 ofetch.ts) ---
        let proxyUrl: string | undefined = undefined;

        // 1. 检查全局策略或 Header 标记
        const strategyUseProxy = config.proxy.strategy === 'all';
        const headers = mergedOptions.headers || {};
        const headerUseProxy = headers['x-prefer-proxy'] === '1' || headers['X-Prefer-Proxy'] === '1';

        if (strategyUseProxy || headerUseProxy) {
            let currentProxy = proxy.getCurrentProxy();

            // 2. 处理动态代理初始化 (重要：RSSHub 的某些代理是异步的)
            if (currentProxy?.isDynamic && !currentProxy.uri) {
                if ((proxy as any).dynamicProxyPromise && typeof (proxy as any).dynamicProxyPromise === 'function') {
                    try {
                        const dynamicProxyFunc = (proxy as any).dynamicProxyPromise;
                        const dynamicProxyInstance = await dynamicProxyFunc();
                        if (dynamicProxyInstance) {
                            const dynamicProxyResult = await dynamicProxyInstance.getProxy();
                            if (dynamicProxyResult) {
                                proxyUrl = dynamicProxyResult.uri;
                            }
                        }
                    } catch (error) {
                        logger.error('Got-Scraping: Failed to get dynamic proxy', error);
                    }
                }
            } else if (currentProxy?.uri) {
                proxyUrl = currentProxy.uri;
            }
        }
        // --- 代理获取逻辑结束 ---

        // const finalOptions: any = {
        //     ...mergedOptions,
        //     proxyUrl, // 注入得到的代理 URL
        //     headerGeneratorOptions: {
        //         browsers: [{ name: 'chrome', minVersion: 100 }],
        //         devices: ['desktop'],
        //         operatingSystems: ['macos'],
        //     },
        //     timeout: typeof mergedOptions.timeout === 'number' ? { request: mergedOptions.timeout } : mergedOptions.timeout,
        //     retry: { limit: config.requestRetry },
        // };

        const finalOptions: any = {
            ...mergedOptions,
            proxyUrl,
            // 1. 强制关闭 HTTP2，因为很多代理对 H2 的处理会破坏指纹
            http2: false,

            // 2. 降低指纹伪造的强度，只让它生成 Header
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome' }],
                devices: ['desktop'],
                operatingSystems: ['macos'],
            },

            // 3. 明确告诉它不要在握手阶段过于激进
            // 某些代理环境下，伪造 TLS 可能会导致连接被代理重置
            // 如果下面这一行还是不行，可以尝试把 got-scraping 换回普通的 got，仅保留代理逻辑
            timeout: typeof mergedOptions.timeout === 'number' ? { request: mergedOptions.timeout } : mergedOptions.timeout,
            retry: { limit: config.requestRetry },
        };

        // 互斥参数清理
        delete finalOptions.url;
        const method = (mergedOptions.method || 'GET').toUpperCase();
        delete finalOptions.method;

        if (finalOptions.headers) {
            delete finalOptions.headers['x-prefer-proxy'];
            delete finalOptions.headers['X-Prefer-Proxy'];
        }

        try {
            if (proxyUrl) {
                logger.info(`Got-Scraping: [PROXY] Requesting ${requestUrl} via ${maskProxyUri(proxyUrl)}`);
            } else {
                logger.info(`Got-Scraping: [DIRECT] Requesting ${requestUrl}`);
            }

            const response = await gotScraping[method.toLowerCase()](requestUrl, finalOptions);

            return {
                data: response.body,
                body: response.body,
                status: response.statusCode,
                headers: response.headers,
            };
        } catch (error: any) {
            logger.error(`Got-Scraping request fail: ${requestUrl} - ${error.message}`);
            throw error;
        }
    };

    instance.get = (url: string, options?: any) => instance(url, { ...options, method: 'GET' });
    instance.post = (url: string, options?: any) => instance(url, { ...options, method: 'POST' });

    return instance;
};

export default getGotScraping();
