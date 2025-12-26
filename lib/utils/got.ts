import { destr } from 'destr';
import ofetch from '@/utils/ofetch';
import { getSearchParamsString } from './helpers';
import { spawnSync } from 'node:child_process';
import iconv from 'iconv-lite';

// 方案3：原生 Curl 执行器，解决 403 拦截和代理 407 认证问题
const curlNative = (url: string, options: any) => {
    // 使用 -s 隐藏进度条，-L 跟随重定向，-v 调试
    const args = ['-s', '-L'];
    console.log('tiaoshi'，options);
    // 1. 严格按照你成功的命令处理代理
    if (options.proxyUri) {
        try {
            const pUrl = new URL(options.proxyUri);
            // 格式: -x http://host:port
            args.push('-x', `${pUrl.protocol}//${pUrl.host}`);
            // 格式: --proxy-user user:pass
            if (pUrl.username && pUrl.password) {
                args.push('--proxy-user', `${pUrl.username}:${pUrl.password}`);
            }
        } catch (e) {
            args.push('-x', options.proxyUri);
        }
    }

    // 2. 核心头部伪装 (只保留你测试成功的)
    const essentialHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://news.10jqka.com.cn/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Connection': 'keep-alive'
    };

    // 合并头部，但要过滤掉 options 中可能存在的 node-fetch 自带头部
    const inputHeaders = options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : (options.headers || {});

    const finalHeaders = { ...essentialHeaders, ...inputHeaders };

    // 过滤掉可能导致 Forbidden 的头部
    const blackList = ['host', 'accept-encoding', 'content-length', 'content-type'];

    for (const [key, value] of Object.entries(finalHeaders)) {
        if (!blackList.includes(key.toLowerCase()) && typeof value === 'string') {
            args.push('-H', `${key}: ${value}`);
        }
    }

    // 3. 基础 TLS 设置
    args.push('--tls-max', '1.3');

    args.push(url);

    const result = spawnSync('curl', args, {
        encoding: null, // 必须为 null，保持原始 Buffer 处理 GBK
        maxBuffer: 20 * 1024 * 1024,
        shell: false
    });

    if (result.status !== 0) {
        throw new Error(`Curl failed with status ${result.status}`);
    }

    return {
        data: result.stdout,
        body: result.stdout,
        status: 200
    };
};

const getFakeGot = (defaultOptions?: any) => {
    const fakeGot = (request: any, options?: any) => {
        // --- 基础参数处理逻辑保持不变 ---
        if (!(typeof request === 'string' || request instanceof Request) && request.url) {
            options = { ...request, ...options };
            request = request.url;
        }
        if (options?.hooks?.beforeRequest) {
            for (const hook of options.hooks.beforeRequest) {
                hook(options);
            }
            delete options.hooks;
        }
        options = { ...defaultOptions, ...options };

        if (options?.json && !options.body) {
            options.body = options.json;
            delete options.json;
        }
        if (options?.form && !options.body) {
            options.body = new URLSearchParams(options.form as Record<string, string>).toString();
            if (!options.headers) options.headers = {};
            options.headers['content-type'] = 'application/x-www-form-urlencoded';
            delete options.form;
        }
        if (options?.searchParams) {
            const separator = request.includes('?') ? '&' : '?';
            request += separator + getSearchParamsString(options.searchParams);
            delete options.searchParams;
        }

        // --- 特殊域名拦截逻辑 ---
        const urlString = typeof request === 'string' ? request : request.url;
        console.log('调试', urlString, urlString.includes('10jqka.com.cn'));
        // 【核心拦截】：如果是同花顺请求，先调用 ofetch 触发 onRequest 填充代理
        // 【核心拦截】：如果是同花顺请求
        // @/utils/got.ts

        if (urlString.includes('10jqka.com.cn')) {
            return (async () => {
                // 1. 直接调用 ofetch 获取完整的配置（包括代理）
                const tempOptions = { ...options, retry: 0 };

                try {
                    // 使用一个虚拟请求触发 ofetch 的 onRequest 逻辑
                    const rawResponse = await ofetch.raw(urlString, {
                        ...tempOptions,
                        method: 'HEAD',
                        onResponse: () => {}, // 空回调避免实际请求
                        onRequestError: () => {} // 捕获可能的错误
                    }).catch(() => null);

                    console.log('rawResponse 状态:', rawResponse?.status);
                } catch (e) {
                    console.log('ofetch.raw 捕获错误（预期中）:', e.message);
                }

                // 2. 【关键】从全局代理模块获取当前代理
                let proxyUri;

                // 方法A：尝试从代理模块直接获取
                try {
                    const proxyModule = require('@/utils/proxy');
                    const currentProxy = proxyModule.getCurrentProxy();
                    if (currentProxy?.uri) {
                        proxyUri = currentProxy.uri;
                        console.log('从 proxy 模块获取代理:', proxyUri);
                    }
                } catch (e) {
                    console.log('无法从 proxy 模块获取:', e.message);
                }

                // 方法B：如果方法A失败，回退到 ofetch 注入的方式
                if (!proxyUri) {
                    proxyUri = (tempOptions as any).proxyUri || (options as any).proxyUri;
                    console.log('从 options 获取代理:', proxyUri);
                }

                // 3. 执行 Curl
                const res = curlNative(urlString, {
                    ...options,
                    proxyUri: proxyUri,
                    headers
                });

                return {
                    ...res,
                    data: res.data,
                    body: res.data
                };
            })();
        }

        // --- 普通请求逻辑保持不变 ---
        options.parseResponse = (responseText) => ({
            data: destr(responseText),
            body: responseText,
        });

        if (options?.responseType === 'buffer' || options?.responseType === 'arrayBuffer') {
            options.responseType = 'arrayBuffer';
            delete options.parseResponse;
        }

        if (options.cookieJar) {
            const cookies = options.cookieJar.getCookiesSync(request);
            if (cookies.length) {
                if (!options.headers) options.headers = {};
                options.headers.cookie = cookies.join('; ');
            }
            delete options.cookieJar;
        }

        const response = ofetch(request, options);

        if (options?.responseType === 'arrayBuffer') {
            return response.then((responseData) => ({
                data: Buffer.from(responseData),
                body: Buffer.from(responseData),
            }));
        }
        return response;
    };

    // 绑定便捷方法
    fakeGot.get = (request, options?) => fakeGot(request, { ...options, method: 'GET' });
    fakeGot.post = (request, options?) => fakeGot(request, { ...options, method: 'POST' });
    // ... 其他方法保持不变 ...
    fakeGot.extend = (options) => getFakeGot(options);

    return fakeGot;
};

export default getFakeGot();
