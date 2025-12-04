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
    urlHandler: (URL & { username?: string; password?: string }) | null;
    username?: string;
    password?: string;
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
            await this.cacheProxy(newProxy as DynamicProxyResult & { deadline: string, username: string, password: string });
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
                return { uri: proxyInfo.uri,
                    urlHandler: proxyInfo.urlHandler,
                    username: config.proxyService.key,
                    password: config.proxyService.pwd,
                };
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
                // eslint-disable-next-line no-await-in-loop
                const response = await ofetch<ProxyResponse>(url, { timeout: 5000 });

                if (response.code === 'SUCCESS' && response.data && response.data.length > 0) {
                    const proxyData = response.data[0];
                    const uri = `http://${proxyData.server}`;

                    // 获取认证信息
                    const username = config.proxyService.key;
                    const password = config.proxyService.pwd;

                    // 创建包含认证信息的 URL
                    const authUri = `http://${username}:${password}@${proxyData.server}`;
                    let urlHandler: URL | null = null;

                    try {
                        urlHandler = new URL(authUri);

                        // 在 urlHandler 对象上添加认证信息
                        if (urlHandler) {
                            // 注意：URL 标准属性是只读的，我们使用自定义属性
                            Object.defineProperty(urlHandler, 'username', {
                                value: username,
                                writable: false,
                                enumerable: true
                            });
                            Object.defineProperty(urlHandler, 'password', {
                                value: password,
                                writable: false,
                                enumerable: true
                            });
                        }
                    } catch (error) {
                        this.logger.error('Error parsing proxy URL:', error);
                    }

                    this.logger.info(`Successfully fetched dynamic proxy: ${authUri.replace(password, '***')} (expires: ${proxyData.deadline})`);

                    return {
                        uri: authUri, // 返回带认证信息的完整 URI
                        urlHandler,
                        deadline: proxyData.deadline,
                        username,
                        password,
                    };
                } else {
                    this.logger.warn(`Attempt ${i + 1} - Failed to fetch dynamic proxy from service:`, response);
                }
            } catch (error) {
                this.logger.error(`Attempt ${i + 1} - Error fetching dynamic proxy from service:`, error instanceof Error ? error : new Error(String(error)));
            }

            if (i < maxRetries) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
            }
        }

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
