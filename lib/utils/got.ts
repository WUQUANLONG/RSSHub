import { destr } from 'destr';
import ofetch from '@/utils/ofetch';
import { getSearchParamsString } from './helpers';
import { spawnSync } from 'node:child_process';
import iconv from 'iconv-lite';
import proxy from '@/utils/proxy';

// 方案3：原生 Curl 执行器，解决 403 拦截和代理 407 认证问题
// @/utils/got.ts

const curlNative = (url: string, options: any) => {
    // 1. 初始化基础参数
    const args = ['-s', '-L', '--compressed']; // 加上 --compressed 自动处理 gzip

    // 2. 代理设置
    if (options.proxyUri) {
        try {
            const proxyInstance = new URL(options.proxyUri);
            // 注意：-p 是 proxytunnel，通常配合 -x 使用
            args.push('-x', `${proxyInstance.protocol}//${proxyInstance.host}`);
            if (proxyInstance.username && proxyInstance.password) {
                args.push('--proxy-user', `${proxyInstance.username}:${proxyInstance.password}`);
            }
        } catch (e) {
            args.push('-x', options.proxyUri);
        }
    }

    // 3. 头部处理
    const essentialHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://news.10jqka.com.cn/',
        'Accept': 'application/json, text/plain, */*', // 既然是调接口，明确声明接受 json
        'Connection': 'keep-alive'
    };

    const inputHeaders = options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : (options.headers || {});

    const finalHeaders = { ...essentialHeaders, ...inputHeaders };
    const blackList = ['host', 'accept-encoding', 'content-length', 'content-type'];

    for (const [key, value] of Object.entries(finalHeaders)) {
        if (!blackList.includes(key.toLowerCase()) && typeof value === 'string') {
            args.push('-H', `${key}: ${value}`);
        }
    }

    // 4. 协议与安全性设置 (只加一次)
    args.push('--tls-max', '1.3', '--http1.1');
    args.push('--connect-timeout', '10'); // 增加超时保护

    // 5. 【关键】URL 必须最后且只加一次
    args.push(url);

    const result = spawnSync('curl', args, {
        encoding: null,
        maxBuffer: 20 * 1024 * 1024,
        shell: false
    });

    if (result.status !== 0) {
        const errorMsg = result.stderr ? result.stderr.toString() : 'Unknown Error';
        throw new Error(`Curl failed [${result.status}]: ${errorMsg}`);
    }

    return {
        data: result.stdout,
        body: result.stdout, // 兼容性保留
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
                // --- 第一步：复用你提供的代理获取逻辑 ---
                let currentProxy = proxy.getCurrentProxy();

                if (currentProxy?.isDynamic && !currentProxy.uri) {
                    if ((proxy as any).dynamicProxyPromise && typeof (proxy as any).dynamicProxyPromise === 'function') {
                        try {
                            const dynamicProxyPromiseFunc = (proxy as any).dynamicProxyPromise;
                            const dynamicProxy = await dynamicProxyPromiseFunc();
                            if (dynamicProxy) {
                                const dynamicProxyResult = await dynamicProxy.getProxy();
                                if (dynamicProxyResult) {
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
                            console.error('Error getting dynamic proxy in Got:', error);
                        }
                    }
                }

                const capturedProxyUri = currentProxy?.uri;
                console.log('--- [GOT 拦截层] 最终捕获代理:', capturedProxyUri ? '已获取' : '未获取');

                // --- 第二步：准备精简的 Headers ---
                // 只保留你手动测试成功的核心头，避免 Docker 环境干扰
                const finalHeaders = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://news.10jqka.com.cn/',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Connection': 'keep-alive'
                };

                // --- 第三步：执行 curlNative ---
                // 传入 capturedProxyUri，确保护航
                const res = curlNative(urlString, {
                    ...options,
                    proxyUri: capturedProxyUri,
                    headers: finalHeaders
                });

                // --- 第四步：Buffer 返回，对齐外部 iconv 处理 ---
                return {
                    status: 200,
                    data: res.data,
                    body: res.data,
                    headers: {}
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
