import { config } from '@/config';
import { PacProxyAgent } from 'pac-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyAgent } from 'undici';
import logger, { maskProxyUri, proxyInfo, proxyError } from '@/utils/logger';
import { DynamicProxy } from './dynamic-proxy';
import cache from '@/utils/cache';

const proxyIsPAC = config.pacUri || config.pacScript;

import pacProxy from './pac-proxy';
import unifyProxy from './unify-proxy';
import createMultiProxy, { type MultiProxyResult, type ProxyState } from './multi-proxy';

// Declare agent and dispatcher first
let agent: PacProxyAgent<string> | HttpsProxyAgent<string> | SocksProxyAgent | null = null;
let dispatcher: ProxyAgent | null = null;

// Dynamic proxy will be initialized asynchronously
let dynamicProxyPromise: Promise<DynamicProxy | null> | null = null;

let dynamicProxyInstance: DynamicProxy | null = null;

if (config.proxyService.host && config.proxyService.key) {
    // Initialize dynamicProxyInstance without immediately creating the promise
    dynamicProxyInstance = new DynamicProxy(cache, logger);
    logger.info('Dynamic proxy service initialized');
}

// dynamicProxyPromise will be set on-demand when needed
// dynamicProxyPromise = dynamicProxyInitPromise;

interface ProxyExport {
    agent: PacProxyAgent<string> | HttpsProxyAgent<string> | SocksProxyAgent | null;
    dispatcher: ProxyAgent | null;
    proxyUri?: string;
    proxyObj: Record<string, any>;
    proxyUrlHandler?: URL | null;
    multiProxy?: MultiProxyResult;
    getCurrentProxy: () => ProxyState | null;
    markProxyFailed: (proxyUri: string) => void;
    getAgentForProxy: (proxyState: ProxyState) => any;
    getDispatcherForProxy: (proxyState: ProxyState) => ProxyAgent | null;
    dynamicProxyPromise?: Promise<DynamicProxy | null> | null;
}

let proxyUri: string | undefined;
let proxyObj: Record<string, any> = {};
let proxyUrlHandler: URL | null = null;
let multiProxy: MultiProxyResult | undefined;

const createAgentForProxy = (uri: string, proxyObj: Record<string, any>): any => {
    if (uri.startsWith('http')) {
        return new HttpsProxyAgent(uri, {
            headers: {
                'proxy-authorization': proxyObj?.auth ? `Basic ${proxyObj.auth}` : undefined,
            },
        });
    } else if (uri.startsWith('socks')) {
        return new SocksProxyAgent(uri);
    }
    return null;
};

const createDispatcherForProxy = (uri: string, proxyObj: Record<string, any>): ProxyAgent | null => {
    if (uri.startsWith('http')) {
        return new ProxyAgent({
            uri,
            token: proxyObj?.auth ? `Basic ${proxyObj.auth}` : undefined,
            requestTls: {
                rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
            },
        });
    }
    return null;
};

// Initialize proxy configuration based on settings
const initializeProxyConfig = async () => {
    if (proxyIsPAC) {
        const proxy = pacProxy(config.pacUri, config.pacScript, config.proxy);
        return { proxyUri: proxy.proxyUri, proxyObj: proxy.proxyObj, proxyUrlHandler: proxy.proxyUrlHandler };
    } else if (config.proxyUris && config.proxyUris.length > 0) {
        multiProxy = createMultiProxy(config.proxyUris, config.proxy);
        const currentProxy = multiProxy.getNextProxy();
        if (currentProxy) {
            logger.info(`Multi-proxy initialized with ${config.proxyUris.length} proxies`);
            return {
                proxyObj: multiProxy.proxyObj,
                proxyUri: currentProxy.uri,
                proxyUrlHandler: currentProxy.urlHandler,
            };
        }
    } else if (dynamicProxyPromise) {
        try {
            // Create the dynamicProxyPromise on-demand when needed
            if (!dynamicProxyPromise && dynamicProxyInstance) {
                dynamicProxyPromise = Promise.resolve(dynamicProxyInstance);
            }

            if (dynamicProxyPromise) {
                const dynamicProxy = await dynamicProxyPromise;
                if (dynamicProxy) {
                    // Get the proxy (this will check cache first, then fetch if needed)
                    const dynamicProxyResult = await dynamicProxy.getProxy();
                    if (dynamicProxyResult) {
                        logger.info('Using dynamic proxy:', maskProxyUri(dynamicProxyResult.uri));
                        return {
                            proxyUri: dynamicProxyResult.uri,
                            proxyObj: {
                                ...config.proxy,
                                protocol: 'http',
                            },
                            proxyUrlHandler: dynamicProxyResult.urlHandler,
                        };
                    } else {
                        logger.error('Failed to obtain dynamic proxy from service');
                    }
                }
            }
        } catch (error) {
            logger.error('Error getting dynamic proxy:', error);
        }
    }

    // Use static proxy configuration as fallback
    const proxy = unifyProxy(config.proxyUri, config.proxy);
    return {
        proxyUri: proxy.proxyUri,
        proxyObj: proxy.proxyObj,
        proxyUrlHandler: proxy.proxyUrlHandler,
    };
};

// Initialize the proxy configuration
initializeProxyConfig().then((result) => {
    if (result) {
        ({ proxyUri, proxyObj, proxyUrlHandler } = result);
        if (proxyUri) {
            agent = createAgentForProxy(proxyUri, proxyObj);
            dispatcher = createDispatcherForProxy(proxyUri, proxyObj);
        }
    }
});

const getCurrentProxy = (): ProxyState | null => {
    if (multiProxy) {
        return multiProxy.getNextProxy();
    }
    if (proxyUri) {
        return {
            uri: proxyUri,
            isActive: true,
            failureCount: 0,
            urlHandler: proxyUrlHandler,
            // Include a marker that this is a dynamic proxy
            isDynamic: config.proxyService.host && config.proxyService.key ? true : undefined,
        };
    }

    // If no static proxy is configured but dynamic proxy is available, return a placeholder
    if (config.proxyService.host && config.proxyService.key) {
        return {
            uri: '',
            isActive: false,
            failureCount: 0,
            urlHandler: null,
            isDynamic: true,
        };
    }

    return null;
};

const markProxyFailed = (failedProxyUri: string) => {
    if (multiProxy) {
        multiProxy.markProxyFailed(failedProxyUri);
        const nextProxy = multiProxy.getNextProxy();
        if (nextProxy) {
            proxyUri = nextProxy.uri;
            proxyUrlHandler = nextProxy.urlHandler || null;
            agent = createAgentForProxy(nextProxy.uri, proxyObj);
            dispatcher = createDispatcherForProxy(nextProxy.uri, proxyObj);
            logger.info(`Switched to proxy: ${nextProxy.uri}`);
        } else {
            logger.warn('No available proxies remaining');
            agent = null;
            dispatcher = null;
            proxyUri = undefined;
        }
    } else if (config.proxyService.host && config.proxyService.key && failedProxyUri === proxyUri) {
        // For dynamic proxies, clear the cache so we fetch a new one on next request
        try {
            cache.set(PROXY_CACHE_KEY, '', 1); // Set to expire immediately
            logger.info('Cleared cached dynamic proxy after failure');
        } catch (error) {
            logger.error('Error clearing cached dynamic proxy:', error);
        }
    }
};

const getAgentForProxy = (proxyState: ProxyState) => createAgentForProxy(proxyState.uri, proxyObj);

const getDispatcherForProxy = (proxyState: ProxyState) => createDispatcherForProxy(proxyState.uri, proxyObj);

const proxyExport: ProxyExport = {
    agent,
    dispatcher,
    proxyUri,
    proxyObj,
    proxyUrlHandler,
    multiProxy,
    getCurrentProxy,
    markProxyFailed,
    getAgentForProxy,
    getDispatcherForProxy,
    // Initialize dynamicProxyPromise on-demand when needed
    // dynamicProxyPromise will be created in initializeProxyConfig when required
    dynamicProxyPromise:
        config.proxyService.host && config.proxyService.key
            ? () => {
                  if (!dynamicProxyPromise) {
                      dynamicProxyPromise = Promise.resolve(dynamicProxyInstance);
                  }
                  return dynamicProxyPromise;
              }
            : undefined,
};

export default proxyExport;
