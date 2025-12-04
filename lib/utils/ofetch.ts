import { createFetch } from 'ofetch';
import { config } from '@/config';
import logger, { maskProxyUri, proxyInfo, proxyError } from '@/utils/logger';
import { register } from 'node-network-devtools';
import type { HeaderGeneratorOptions } from 'header-generator';
import proxy from '@/utils/proxy';

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
        // Check if we should use a proxy for this request
        const shouldUseProxy = config.proxy.strategy === 'all' || (context.options.headers && (context.options.headers as Record<string, string>)['x-prefer-proxy'] === '1') || context.options.retry;

        if (shouldUseProxy) {
            logger.info('Request requires proxy, attempting to get proxy server');
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
                    const HttpAgent = (await import('agentkeepalive')).HttpsAgent;
                    context.options.agent = {
                        [protocol]: new HttpAgent({
                            host,
                            port: Number.parseInt(port),
                            maxSockets: 50,
                            maxFreeSockets: 10,
                            timeout: 60000,
                            freeSocketTimeout: 30000,
                        }),
                    };

                    logger.info(`Using proxy ${maskProxyUri(currentProxy.uri)} for request ${context.request}`);
                    //logger.info(`Proxy connection details - Host: ${host}, Port: ${port}, Protocol: ${protocol}`);
                } catch (error) {
                    logger.error('Failed to set up proxy for request:', error);
                }
            }
        }
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
