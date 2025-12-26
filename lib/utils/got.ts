import { destr } from 'destr';
import ofetch from '@/utils/ofetch';
import { getSearchParamsString } from './helpers';
import { spawnSync } from 'node:child_process';
import iconv from 'iconv-lite';

// 方案3：原生 Curl 执行器，解决 403 拦截和代理 407 认证问题
const curlNative = (url: string, options: any) => {
    // 使用 -s 隐藏进度条，-L 跟随重定向，-v 调试
    const args = ['-s', '-L'];

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
                // 1. 创建一个临时的配置对象，用来接收 ofetch 注入的代理信息
                const tempOptions = { ...options, retry: 0 };

                try {
                    // 触发 ofetch 的 onRequest 逻辑
                    await ofetch.raw(urlString, {
                        ...tempOptions,
                        method: 'HEAD',
                        onResponse: () => {} // 尽早结束
                    }).catch(() => {});
                } catch (e) {}

                // 2. 从 tempOptions 或 options 中提取 proxyUri
                const finalProxy = (tempOptions as any).proxyUri || (options as any).proxyUri;

                // 3. 构造 Headers
                const headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://news.10jqka.com.cn/',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Connection': 'keep-alive',
                    ...options.headers
                };

                // 4. 执行 Curl (传入提取到的动态代理)
                const res = curlNative(urlString, { ...options, proxyUri: finalProxy, headers });
                // 即使外部需要字符串，我们在这里也直接把原始 Buffer 给出去
                // 这样你外部的 iconv.decode(response.data, 'gbk') 就能拿到真正的 GBK 字节流了
                return {
                    ...res,
                    data: res.data,
                    body: res.data
                };
                // // 5. 统一返回格式 因为是 gbk， 解码会出现问题
                // const bodyBuffer = res.data;
                // const bodyString = bodyBuffer.toString();
                //
                // return {
                //     status: 200,
                //     data: options.responseType === 'arrayBuffer' ? bodyBuffer : destr(bodyString),
                //     body: options.responseType === 'arrayBuffer' ? bodyBuffer : bodyString,
                //     headers: {} // 如果需要响应头，可以从 curl 的 stderr 中解析
                // };
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
