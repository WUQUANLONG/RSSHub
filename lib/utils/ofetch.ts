import { createFetch } from 'ofetch';
import { config } from '@/config';
import logger, { maskProxyUri, proxyInfo, proxyError } from '@/utils/logger';
import { register } from 'node-network-devtools';
import type { HeaderGeneratorOptions } from 'header-generator';
import proxy from '@/utils/proxy';
import { HttpsProxyAgent } from 'hpagent';

declare module 'ofetch' {
    interface FetchOptions {
        headerGeneratorOptions?: Partial<HeaderGeneratorOptions>;
    }
}

config.enableRemoteDebugging && process.env.NODE_ENV === 'dev' && register();

const rofetch = createFetch().create({
    retryStatusCodes: [400, 408, 409, 425, 429, 500, 502, 503, 504],
    retry: config.requestRetry,
    retryDelay: 1000,
    // timeout: config.requestTimeout,
    async onRequest(context) {
        //console.log('=== DEBUG Headers Type ===');
        //console.log('Headers type:', context.options.headers?.constructor?.name);
        //console.log('Is Headers instance?', context.options.headers instanceof Headers);

        // 检查是否应该使用代理
        let shouldUseProxy = false;

        // 1. 检查全局策略
        shouldUseProxy = config.proxy.strategy === 'all';
        //console.log(`Global proxy strategy: ${config.proxy.strategy}, should use proxy: ${shouldUseProxy}`);

        // 2. 检查 header
        if (!shouldUseProxy && context.options.headers) {
            let proxyHeaderValue: string | null = null;

            if (context.options.headers instanceof Headers) {
                // Headers 对象 - 使用 get() 方法
                proxyHeaderValue = context.options.headers.get('x-prefer-proxy');
                //console.log(`Getting from Headers instance: x-prefer-proxy = ${proxyHeaderValue}`);
            } else if (typeof context.options.headers === 'object') {
                // 普通对象
                const headersObj = context.options.headers as Record<string, any>;
                proxyHeaderValue = headersObj['x-prefer-proxy'] ||
                    headersObj['X-Prefer-Proxy'] ||
                    headersObj['X-PREFER-PROXY'];
                //console.log(`Getting from plain object: x-prefer-proxy = ${proxyHeaderValue}`);
            }

            //console.log(`Proxy header value: ${proxyHeaderValue}`);
            shouldUseProxy = proxyHeaderValue === '1';
        }

        //console.log(`Final - Should use proxy: ${shouldUseProxy} for request ${context.request}`);
        //console.log('=== DEBUG End ===\n');

        // 明确清除可能的代理配置（对于不需要代理的请求）
        if (!shouldUseProxy) {
            // 清除之前可能设置的代理配置
            context.options.agent = undefined;
            context.options.proxy = undefined;

            // 为直连请求设置默认的连接池配置
            try {
                const { HttpsAgent, HttpAgent } = await import('agentkeepalive');

                // 根据请求的协议使用不同的 Agent
                const requestUrl = new URL(context.request.toString());
                const isHttps = requestUrl.protocol === 'https:';

                context.options.agent = {
                    http: new HttpAgent({
                        maxSockets: 50,
                        maxFreeSockets: 10,
                        timeout: 60000,
                        freeSocketTimeout: 30000,
                        keepAlive: true
                    }),
                    https: new HttpsAgent({
                        maxSockets: 50,
                        maxFreeSockets: 10,
                        timeout: 60000,
                        freeSocketTimeout: 30000,
                        keepAlive: true
                    })
                };

                //logger.debug(`Using direct connection for request ${context.request}`);
            } catch (error) {
                logger.debug(`Setting up direct connection agent: ${error.message}`);
            }

            return; // 不需要代理，直接返回
        }

        //logger.info('Request requires proxy, attempting to get proxy server');
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

            // Set up proxy configuration
            try {
                // const HttpAgent = (await import('agentkeepalive')).HttpsAgent;
                // context.options.agent = {
                //     [protocol]: new HttpAgent({
                //         host,
                //         port: Number.parseInt(port),
                //         maxSockets: 50,
                //         maxFreeSockets: 10,
                //         timeout: 60000,
                //         freeSocketTimeout: 30000,
                //     }),
                // };
                // logger.info(`Using proxy ${maskProxyUri(currentProxy.uri)} for request ${context.request}`);
                //logger.info(`Proxy connection details - Host: ${host}, Port: ${port}, Protocol: ${protocol}`);
                const proxyUri = currentProxy.uri;
                context.options.agent = new HttpsProxyAgent({
                    keepAlive: true,
                    keepAliveMsecs: 1000,
                    maxSockets: 50,
                    maxFreeSockets: 10,
                    proxy: proxyUri // 直接传入完整的代理 URI，包括用户名密码
                });
                logger.info(`Using TRUE proxy tunnel ${maskProxyUri(proxyUri)} for ${context.request}`);
            } catch (error) {
                logger.error('Failed to set up proxy for request:', error);
            }


        }

        //console.log('请求头数', context.options.headers);
    },

    onResponseError({ request, response, options }) {
        if (options.retry) {
            logger.warn(`Request ${request} with error ${response.status} remaining retry attempts: ${options.retry}`);
            if (!options.headers) {
                (options as any).headers = {};
            }
            if (options.headers instanceof Headers) {
                options.headers.set('x-prefer-proxy', '1');
            } else {
                ((options as any).headers as Record<string, string>)['x-prefer-proxy'] = '1';
            }
        }
    },
    onRequestError({ request, error }) {
        logger.error(`Request ${request} fail: ${error.cause} ${error}`);
    },
    onResponse({ request, response }) {
        if (response.redirected) {
            logger.http(`Redirecting to ${response.url} for ${request}`);
        }
    },
});

export default rofetch;
