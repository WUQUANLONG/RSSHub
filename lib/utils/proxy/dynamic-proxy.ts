// import { config } from '@/config';
// import { ofetch } from 'ofetch';
// import Redis from 'ioredis';
//
// interface ProxyResponse {
//     code: string;
//     data: Array<{
//         proxy_ip: string;
//         server: string;
//         area_code: number;
//         area: string;
//         isp: string;
//         deadline: string;
//     }>;
//     request_id: string;
// }
//
// const PROXY_CACHE_KEY = 'rsshub:proxy:current';
// const PROXY_LOCK_KEY = 'rsshub:proxy:lock';
// const LOCK_TIMEOUT = 10000; // 锁超时时间10秒
// const LOCK_RETRY_DELAY = 100; // 获取锁失败后的重试延迟
// const MAX_LOCK_RETRIES = 5; // 最大重试次数
//
// export interface DynamicProxyResult {
//     uri: string;
//     urlHandler: (URL & { username?: string; password?: string }) | null;
//     username?: string;
//     password?: string;
//     deadline?: string;
// }
//
// export class DynamicProxy {
//     private readonly cache;
//     private readonly logger;
//     private readonly redisClient: Redis;
//
//     constructor(cache, logger) {
//         this.cache = cache;
//         this.logger = logger;
//
//         // 从环境变量或配置中获取Redis连接信息
//         const redisUrl = process.env.REDIS_URL || config.redis?.url || 'redis://localhost:6379/0';
//         this.redisClient = new Redis(redisUrl, {
//             retryStrategy: (times) => {
//                 const delay = Math.min(times * 50, 2000);
//                 return delay;
//             },
//             maxRetriesPerRequest: 3,
//             enableReadyCheck: true,
//             lazyConnect: true,
//         });
//
//         // 监听Redis连接错误
//         this.redisClient.on('error', (error) => {
//             this.logger.error('Redis client error:', error);
//         });
//
//         this.redisClient.on('connect', () => {
//             this.logger.info('Redis client connected');
//         });
//     }
//
//     async getProxy(): Promise<DynamicProxyResult | null> {
//         try {
//             // 首先尝试从缓存获取代理
//             const cachedProxy = await this.getCachedProxy();
//             if (cachedProxy) {
//                 this.logger.info('Using cached dynamic proxy');
//                 return cachedProxy;
//             }
//
//             // 如果没有缓存或已过期，使用分布式锁获取新代理
//             this.logger.info('No valid cached proxy, attempting to fetch new one with lock');
//             return await this.getProxyWithLock();
//         } catch (error) {
//             this.logger.error('Error getting proxy:', error);
//             return null;
//         }
//     }
//
//     private async getProxyWithLock(): Promise<DynamicProxyResult | null> {
//         const lockIdentifier = `lock:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
//         let lockAcquired = false;
//
//         try {
//             // 尝试获取分布式锁
//             for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
//                 try {
//                     // 使用SET命令获取锁（NX表示不存在时才设置，PX设置过期时间）
//                     const result = await this.redisClient.set(
//                         PROXY_LOCK_KEY,
//                         lockIdentifier,
//                         'PX',
//                         LOCK_TIMEOUT,
//                         'NX'
//                     );
//
//                     if (result === 'OK') {
//                         lockAcquired = true;
//                         this.logger.debug(`Acquired proxy fetch lock: ${lockIdentifier}`);
//                         break;
//                     }
//
//                     // 锁被占用，等待后重试
//                     if (attempt < MAX_LOCK_RETRIES - 1) {
//                         await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY * (attempt + 1)));
//
//                         // 等待期间检查是否有其他进程已经获取了代理
//                         const cachedProxy = await this.getCachedProxy();
//                         if (cachedProxy) {
//                             this.logger.info('Proxy was already fetched by another process during lock wait');
//                             return cachedProxy;
//                         }
//                     }
//                 } catch (lockError) {
//                     this.logger.warn(`Lock acquisition attempt ${attempt + 1} failed:`, lockError);
//                     if (attempt === MAX_LOCK_RETRIES - 1) {
//                         throw lockError;
//                     }
//                 }
//             }
//
//             // 如果最终没有获取到锁，直接尝试从缓存获取（最后检查）
//             if (!lockAcquired) {
//                 this.logger.warn('Failed to acquire lock after all retries, checking cache one last time');
//                 const cachedProxy = await this.getCachedProxy();
//                 if (cachedProxy) {
//                     return cachedProxy;
//                 }
//
//                 // 如果缓存还是没有，可能需要考虑降级策略
//                 // 这里可以选择直接获取代理（有一定重复获取的风险，但比返回null好）
//                 this.logger.warn('Proceeding without lock due to lock acquisition failure');
//                 return await this.fetchAndCacheProxy();
//             }
//
//             // 获取锁成功后，再次检查缓存（双检锁模式）
//             const cachedProxy = await this.getCachedProxy();
//             if (cachedProxy) {
//                 this.logger.info('Proxy was already fetched by another process after acquiring lock');
//                 await this.releaseLock(lockIdentifier);
//                 return cachedProxy;
//             }
//
//             // 缓存中仍然没有，去服务端获取新代理
//             this.logger.info('Fetching new dynamic proxy from service');
//             const newProxy = await this.fetchAndCacheProxy();
//
//             if (newProxy) {
//                 await this.releaseLock(lockIdentifier);
//                 return newProxy;
//             }
//
//             await this.releaseLock(lockIdentifier);
//             return null;
//         } catch (error) {
//             this.logger.error('Error in getProxyWithLock:', error);
//
//             // 确保锁被释放（如果获取到了锁）
//             if (lockAcquired) {
//                 try {
//                     await this.releaseLock(lockIdentifier);
//                 } catch (releaseError) {
//                     this.logger.warn('Error releasing lock in finally block:', releaseError);
//                 }
//             }
//
//             // 发生错误时尝试直接从缓存获取
//             const cachedProxy = await this.getCachedProxy();
//             if (cachedProxy) {
//                 this.logger.info('Using cached proxy after error in lock process');
//                 return cachedProxy;
//             }
//
//             return null;
//         }
//     }
//
//     private async fetchAndCacheProxy(): Promise<DynamicProxyResult | null> {
//         const newProxy = await this.fetchProxyFromService();
//
//         if (newProxy && newProxy.deadline) {
//             await this.cacheProxy(newProxy as DynamicProxyResult & { deadline: string });
//             return newProxy;
//         }
//
//         return null;
//     }
//
//     private async releaseLock(lockIdentifier: string): Promise<void> {
//         try {
//             // 使用Lua脚本确保只有锁的持有者才能释放锁
//             const luaScript = `
//                 if redis.call("get", KEYS[1]) == ARGV[1] then
//                     return redis.call("del", KEYS[1])
//                 else
//                     return 0
//                 end
//             `;
//
//             const result = await this.redisClient.eval(luaScript, 1, PROXY_LOCK_KEY, lockIdentifier);
//
//             if (result === 1) {
//                 this.logger.debug(`Released lock: ${lockIdentifier}`);
//             } else {
//                 this.logger.debug(`Lock was already released or taken by another process: ${lockIdentifier}`);
//             }
//         } catch (error) {
//             this.logger.warn('Error releasing lock:', error);
//             // 如果释放锁失败，锁会在过期时间后自动释放
//         }
//     }
//
//     private async getCachedProxy(): Promise<DynamicProxyResult | null> {
//         try {
//             const cached = await this.cache.get(PROXY_CACHE_KEY);
//             if (!cached) {
//                 return null;
//             }
//
//             const proxyInfo: DynamicProxyResult & { deadline: string } = JSON.parse(cached);
//
//             // 验证数据结构是否完整
//             if (!proxyInfo.uri || !proxyInfo.deadline) {
//                 this.logger.warn('Invalid proxy data in cache');
//                 await this.cache.set(PROXY_CACHE_KEY, '', 1);
//                 return null;
//             }
//
//             const now = new Date();
//             const deadline = new Date(proxyInfo.deadline);
//             const adjustedDeadline = new Date(deadline.getTime() - 10000); // 提前10秒过期
//
//             // 检查代理是否仍然有效
//             if (now < adjustedDeadline) {
//                 // 返回代理信息，确保包含认证信息
//                 return {
//                     uri: proxyInfo.uri,
//                     urlHandler: proxyInfo.urlHandler,
//                     username: config.proxyService.key,
//                     password: config.proxyService.pwd,
//                 };
//             } else {
//                 // 代理已过期，从缓存中移除
//                 this.logger.info('Cached dynamic proxy has expired');
//                 await this.cache.set(PROXY_CACHE_KEY, '', 1);
//                 return null;
//             }
//         } catch (error) {
//             this.logger.error('Error reading dynamic proxy from cache:', error);
//             // 缓存数据损坏，清除它
//             try {
//                 await this.cache.set(PROXY_CACHE_KEY, '', 1);
//             } catch {}
//             return null;
//         }
//     }
//
//     private async fetchProxyFromService(): Promise<DynamicProxyResult | null> {
//         const maxRetries = 3; // 减少重试次数，因为外部已经有重试机制
//
//         for (let i = 0; i <= maxRetries; i++) {
//             try {
//                 const url = `${config.proxyService.host}/get?key=${config.proxyService.key}`;
//                 this.logger.debug(`Fetching dynamic proxy (attempt ${i + 1}/${maxRetries + 1})`);
//
//                 const response = await ofetch<ProxyResponse>(url, {
//                     timeout: 5000,
//                     retry: 1,
//                     retryDelay: 1000,
//                 });
//
//                 if (response.code === 'SUCCESS' && response.data && response.data.length > 0) {
//                     const proxyData = response.data[0];
//
//                     // 验证代理数据
//                     if (!proxyData.server || !proxyData.deadline) {
//                         this.logger.warn('Invalid proxy data received from service');
//                         continue;
//                     }
//
//                     // 获取认证信息
//                     const username = config.proxyService.key;
//                     const password = config.proxyService.pwd;
//
//                     // 创建包含认证信息的 URI
//                     const authUri = `http://${username}:${password}@${proxyData.server}`;
//                     let urlHandler: URL | null = null;
//
//                     try {
//                         urlHandler = new URL(authUri);
//
//                         // 在 urlHandler 对象上添加认证信息
//                         Object.defineProperty(urlHandler, 'username', {
//                             value: username,
//                             writable: false,
//                             enumerable: true
//                         });
//                         Object.defineProperty(urlHandler, 'password', {
//                             value: password,
//                             writable: false,
//                             enumerable: true
//                         });
//                     } catch (error) {
//                         this.logger.error('Error parsing proxy URL:', error);
//                         // 继续使用，因为authUri仍然有效
//                     }
//
//                     this.logger.info(`Successfully fetched dynamic proxy (expires: ${proxyData.deadline})`);
//
//                     return {
//                         uri: authUri,
//                         urlHandler,
//                         deadline: proxyData.deadline,
//                         username,
//                         password,
//                     };
//                 } else {
//                     this.logger.warn(`Attempt ${i + 1} - Invalid response from proxy service:`, response.code);
//                 }
//             } catch (error) {
//                 const errorMessage = error instanceof Error ? error.message : String(error);
//                 this.logger.error(`Attempt ${i + 1} - Error fetching dynamic proxy from service:`, errorMessage);
//
//                 // 如果是网络错误，增加重试延迟
//                 if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
//                     await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
//                 }
//             }
//
//             if (i < maxRetries) {
//                 await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
//             }
//         }
//
//         this.logger.error('Failed to fetch dynamic proxy after maximum retries');
//         return null;
//     }
//
//     private async cacheProxy(proxyInfo: DynamicProxyResult & { deadline: string }): Promise<void> {
//         try {
//             // 根据代理过期时间计算缓存过期时间
//             const now = new Date();
//             const deadline = new Date(proxyInfo.deadline);
//             const expiresInMs = deadline.getTime() - now.getTime();
//
//             // 确保有足够的有效期
//             if (expiresInMs < 10000) { // 少于10秒
//                 this.logger.warn('Proxy expiry time is too short, not caching');
//                 return;
//             }
//
//             const expiresInSeconds = Math.floor(expiresInMs / 1000);
//
//             // 存储代理信息，缓存过期时间与代理过期时间一致
//             await this.cache.set(PROXY_CACHE_KEY, JSON.stringify(proxyInfo), expiresInSeconds);
//
//             this.logger.info(`Dynamic proxy cached successfully, expires in ${expiresInSeconds} seconds`);
//         } catch (error) {
//             this.logger.error('Error caching dynamic proxy:', error);
//         }
//     }
//
//     // 测试代理是否可用（可选功能，参考Python版本）
//     async testProxy(proxyInfo: DynamicProxyResult): Promise<boolean> {
//         try {
//             const testUrl = 'https://www.baidu.com';
//             const proxyUri = proxyInfo.uri;
//
//             const response = await ofetch(testUrl, {
//                 proxy: proxyUri,
//                 timeout: 10000,
//                 retry: 0,
//             });
//
//             return response ? true : false;
//         } catch (error) {
//             this.logger.debug('Proxy test failed:', error);
//             return false;
//         }
//     }
//
//     // 清理资源的方法
//     async disconnect(): Promise<void> {
//         try {
//             await this.redisClient.quit();
//             this.logger.info('Redis client disconnected');
//         } catch (error) {
//             this.logger.warn('Error disconnecting Redis client:', error);
//         }
//     }
// }
//
// // 单例模式导出，确保全局只有一个实例
// let dynamicProxyInstance: DynamicProxy | null = null;
//
// export function getDynamicProxy(cache: any, logger: any): DynamicProxy {
//     if (!dynamicProxyInstance) {
//         dynamicProxyInstance = new DynamicProxy(cache, logger);
//     }
//     return dynamicProxyInstance;
// }

// 第二个版本
import { config } from '@/config';
import { ofetch } from 'ofetch';
import Redis from 'ioredis';

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
const PROXY_LOCK_KEY = 'rsshub:proxy:lock';
const LOCK_TIMEOUT = 10000;
const LOCK_RETRY_DELAY = 200; // 稍微增加延迟，给 Redis 写入留出时间
const MAX_LOCK_RETRIES = 10;  // 增加重试次数，应对高并发

export interface DynamicProxyResult {
    uri: string;
    urlHandler: (URL & { username?: string; password?: string }) | null;
    username?: string;
    password?: string;
    deadline?: string;
}

export class DynamicProxy {
    private readonly logger;
    private readonly redisClient: Redis;

    constructor(cache, logger) {
        // 注意：我们直接使用 redisClient 替代传进来的 cache 以保证强一致性
        this.logger = logger;

        const redisUrl = process.env.REDIS_URL || config.redis?.url || 'redis://localhost:6379/0';
        this.redisClient = new Redis(redisUrl, {
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
        });

        this.redisClient.on('error', (error) => this.logger.error('Redis client error:', error));
    }

    /**
     * 获取代理的主入口
     */
    async getProxy(): Promise<DynamicProxyResult | null> {
        try {
            // 1. 直接从 Redis 获取（唯一真相源）
            const cachedProxy = await this.getRawProxyFromRedis();
            if (cachedProxy) {
                return cachedProxy;
            }

            // 2. 缓存失效，进入抢锁流程
            this.logger.info('Proxy expired or missing, attempting to fetch with lock...');
            return await this.getProxyWithLock();
        } catch (error) {
            this.logger.error('Error in getProxy:', error);
            return null;
        }
    }

    /**
     * 带有分布式锁的获取逻辑
     */
    private async getProxyWithLock(): Promise<DynamicProxyResult | null> {
        const lockIdentifier = `lock:${Math.random().toString(36).substring(2, 11)}`;
        let lockAcquired = false;

        try {
            for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
                // 尝试获取锁 (NX: 不存在才设置, PX: 过期时间)
                const result = await this.redisClient.set(PROXY_LOCK_KEY, lockIdentifier, 'PX', LOCK_TIMEOUT, 'NX');

                if (result === 'OK') {
                    lockAcquired = true;
                    break;
                }

                // 没抢到锁，等待期间持续检查 Redis 是否已被其他并发进程更新
                await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY));
                const remoteProxy = await this.getRawProxyFromRedis();
                if (remoteProxy) {
                    return remoteProxy;
                }
            }

            if (!lockAcquired) {
                this.logger.warn('Could not acquire lock, last ditch attempt to read Redis');
                return await this.getRawProxyFromRedis();
            }

            // --- 成功拿到锁 ---
            // 双检：防止在抢锁循环的最后一次间隙中，别人刚好写进去
            const doubleCheck = await this.getRawProxyFromRedis();
            if (doubleCheck) {
                this.logger.info('Proxy updated by another process just before we got the lock');
                return doubleCheck;
            }

            // 真正去请求第三方服务
            return await this.fetchAndCacheProxy();

        } finally {
            if (lockAcquired) {
                await this.releaseLock(lockIdentifier);
            }
        }
    }

    /**
     * 从 Redis 读取并校验有效性
     */
    private async getRawProxyFromRedis(): Promise<DynamicProxyResult | null> {
        const data = await this.redisClient.get(PROXY_CACHE_KEY);
        if (!data) return null;

        try {
            const proxyInfo = JSON.parse(data);
            const now = Date.now();
            const deadline = new Date(proxyInfo.deadline).getTime();

            // 优化点：提前 20 秒认为失效，预留出网络请求和并发排队的时间
            if (now < (deadline - 20000)) {
                return {
                    ...proxyInfo,
                    username: config.proxyService.key,
                    password: config.proxyService.pwd,
                };
            }
            return null; // 已进入过期预警期
        } catch (e) {
            return null;
        }
    }

    private async fetchAndCacheProxy(): Promise<DynamicProxyResult | null> {
        const newProxy = await this.fetchProxyFromService();
        if (newProxy && newProxy.deadline) {
            const now = Date.now();
            const deadline = new Date(newProxy.deadline).getTime();
            const expiresInSeconds = Math.floor((deadline - now) / 1000);

            if (expiresInSeconds > 10) {
                // 写入 Redis，过期时间与代理一致
                await this.redisClient.set(
                    PROXY_CACHE_KEY,
                    JSON.stringify(newProxy),
                    'EX',
                    expiresInSeconds
                );
                this.logger.info(`New proxy cached. TTL: ${expiresInSeconds}s`);
                return newProxy;
            }
        }
        return null;
    }

    private async releaseLock(lockIdentifier: string): Promise<void> {
        const luaScript = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        await this.redisClient.eval(luaScript, 1, PROXY_LOCK_KEY, lockIdentifier);
    }

    private async fetchProxyFromService(): Promise<DynamicProxyResult | null> {
        try {
            const url = `${config.proxyService.host}/get?key=${config.proxyService.key}`;
            const response = await ofetch<ProxyResponse>(url, { timeout: 8000 });

            if (response.code === 'SUCCESS' && response.data?.length > 0) {
                const proxyData = response.data[0];
                const authUri = `http://${config.proxyService.key}:${config.proxyService.pwd}@${proxyData.server}`;

                return {
                    uri: authUri,
                    urlHandler: new URL(authUri),
                    deadline: proxyData.deadline,
                };
            }
        } catch (error) {
            this.logger.error('Service fetch failed:', error);
        }
        return null;
    }

    async disconnect(): Promise<void> {
        await this.redisClient.quit();
    }
}

let dynamicProxyInstance: DynamicProxy | null = null;
export function getDynamicProxy(cache: any, logger: any): DynamicProxy {
    if (!dynamicProxyInstance) {
        dynamicProxyInstance = new DynamicProxy(cache, logger);
    }
    return dynamicProxyInstance;
}
