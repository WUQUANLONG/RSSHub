import { spawnSync } from 'child_process';
import { URL } from 'url';
// 假设你的 proxy 模块路径如下，请根据实际情况调整
import proxy from '@/utils/proxy';

export interface CurlOptions {
    headers?: Record<string, string>;
    timeout?: number;
    method?: 'GET' | 'POST';
    body?: string;
}

export const curlRaw = async (url: string, options: CurlOptions = {}) => {
    // --- 代理自动获取逻辑开始 ---
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
                console.error('Error getting dynamic proxy in CurlEngine:', error);
            }
        }
    }
    const capturedProxyUri = currentProxy?.uri;
    // --- 代理自动获取逻辑结束 ---

    const args = ['-s', '-L', '--compressed'];

    // 1. 注入代理
    if (capturedProxyUri) {
        args.push('-x', capturedProxyUri);
    }

    // 2. 注入 Headers
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...options.headers
    };

    Object.entries(headers).forEach(([k, v]) => {
        if (v) args.push('-H', `${k}: ${v}`);
    });

    // 3. 基础安全设置
    args.push('--tls-max', '1.3', '--http1.1');
    args.push('--connect-timeout', String(options.timeout || 15));

    // 4. 方法处理
    if (options.method === 'POST' && options.body) {
        args.push('-X', 'POST', '-d', options.body);
    }

    // 5. 唯一 URL
    args.push(url);

    const result = spawnSync('curl', args, {
        encoding: null,
        maxBuffer: 50 * 1024 * 1024,
        shell: false
    });

    if (result.status !== 0) {
        const err = result.stderr?.toString() || 'Unknown Curl Error';
        throw new Error(`[Curl ${result.status}] ${err}`);
    }

    return result.stdout;
};
