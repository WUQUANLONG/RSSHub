import { config } from '@/config';
import { ofetch } from 'ofetch';

interface ProxyResponse {
    code: string;
    data: Array<{
        proxy_ip: string;
        server: string;
        area_code: number;
        area: string;
        isp: string;
        deadline: string;
    }>;
    request_id: string;
}

const PROXY_CACHE_KEY = 'rsshub:proxy:current';

export interface DynamicProxyResult {
    uri: string;
    urlHandler: URL | null;
}

export class DynamicProxy {
    private readonly cache;
    private readonly logger;

    constructor(cache, logger) {
        this.cache = cache;
        this.logger = logger;
    }

    async getProxy(): Promise<DynamicProxyResult | null> {
        // First check if we have a valid proxy in cache
        const cachedProxy = await this.getCachedProxy();
        if (cachedProxy) {
            this.logger.info('Using cached dynamic proxy:', cachedProxy.uri);
            return cachedProxy;
        }

        // If no valid proxy in cache, fetch a new one
        this.logger.info('Fetching new dynamic proxy from service');
        const newProxy = await this.fetchProxyFromService();

        if (newProxy && 'deadline' in newProxy) {
            await this.cacheProxy(newProxy as DynamicProxyResult & { deadline: string });
            return newProxy;
        }

        return null;
    }

    private async getCachedProxy(): Promise<DynamicProxyResult | null> {
        try {
            const cached = await this.cache.get(PROXY_CACHE_KEY);
            if (!cached) {
                return null;
            }

            const proxyInfo: DynamicProxyResult & { deadline: string } = JSON.parse(cached);
            const now = new Date();
            const deadline = new Date(proxyInfo.deadline);
            const adjustedDeadline = new Date(deadline.getTime() - 10000);
            // Check if the proxy is still valid
            // console.log('缓存时间', [now, adjustedDeadline]);
            if (now < adjustedDeadline) {
                return { uri: proxyInfo.uri, urlHandler: proxyInfo.urlHandler };
            } else {
                // Proxy has expired, remove it from cache
                await this.cache.set(PROXY_CACHE_KEY, '', 1); // Set to expire immediately
                this.logger.info('Cached dynamic proxy has expired');
                return null;
            }
        } catch (error) {
            this.logger.error('Error reading dynamic proxy from cache:', error);
            return null;
        }
    }

    private async fetchProxyFromService(): Promise<DynamicProxyResult | null> {
        const maxRetries = 10;

        for (let i = 0; i <= maxRetries; i++) {
            try {
                const url = `${config.proxyService.host}/get?key=${config.proxyService.key}`;
                this.logger.info(`Fetching dynamic proxy from: ${url.replace(config.proxyService.key, '***')} (attempt ${i + 1}/${maxRetries + 1})`);
                // 明确告知ESLint：此处需要顺序执行
                // eslint-disable-next-line no-await-in-loop
                const response = await ofetch<ProxyResponse>(url, { timeout: 5000 });

                if (response.code === 'SUCCESS' && response.data && response.data.length > 0) {
                    const proxyData = response.data[0];
                    const uri = `http://${proxyData.server}`;
                    let urlHandler: URL | null = null;

                    try {
                        urlHandler = new URL(uri);
                    } catch (error) {
                        this.logger.error('Error parsing proxy URL:', error);
                    }

                    this.logger.info(`Successfully fetched dynamic proxy: ${uri} (expires: ${proxyData.deadline})`);

                    return {
                        uri,
                        urlHandler,
                        deadline: proxyData.deadline,
                    };
                } else {
                    this.logger.warn(`Attempt ${i + 1} - Failed to fetch dynamic proxy from service:`, response);
                }
            } catch (error) {
                this.logger.error(`Attempt ${i + 1} - Error fetching dynamic proxy from service:`, error instanceof Error ? error : new Error(String(error)));
            }

            // 如果不是最后一次尝试，添加延迟（指数退避策略）
            if (i < maxRetries) {
                // 明确告知ESLint：此处需要顺序执行
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // 延迟时间：1秒, 2秒, 3秒...
            }
        }

        // If we got here, all attempts failed
        this.logger.error('Failed to fetch dynamic proxy after maximum retries', { maxRetries });
        return null;
    }

    private async cacheProxy(proxyInfo: DynamicProxyResult & { deadline: string }): Promise<void> {
        try {
            // Calculate cache expiration based on the proxy deadline
            const now = new Date();
            const deadline = new Date(proxyInfo.deadline);
            const expiresInMs = deadline.getTime() - now.getTime();
            const expiresInSeconds = Math.floor(expiresInMs / 1000);

            // Store proxy info in cache with expiration matching the proxy deadline
            await this.cache.set(PROXY_CACHE_KEY, JSON.stringify(proxyInfo), expiresInSeconds);

            this.logger.info(`Dynamic proxy cached successfully, expires in ${expiresInSeconds} seconds`);
        } catch (error) {
            this.logger.error('Error caching dynamic proxy:', error);
        }
    }
}
