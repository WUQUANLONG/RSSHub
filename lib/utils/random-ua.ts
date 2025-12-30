// utils/random-ua-simple.ts
export const getRandomUserAgent = () => {
    const userAgents = [
        // Chrome
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',

        // Firefox
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',

        // Safari
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',

        // Edge
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
};

export const getRandomHeaders = () => {
    const ua = getRandomUserAgent();

    // 根据 UA 类型设置不同的头
    if (ua.includes('Chrome') && !ua.includes('Edg')) {
        // Chrome
        const version = ua.match(/Chrome\/(\d+\.\d+\.\d+)/)?.[1] || '140.0.0.0';
        const majorVersion = version.split('.')[0];
        const isMac = ua.includes('Macintosh');
        const isWindows = ua.includes('Windows');

        return {
            'User-Agent': ua,
            'Sec-Ch-Ua': `"Chromium";v="${majorVersion}", "Not=A?Brand";v="24", "Google Chrome";v="${majorVersion}"`,
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': isMac ? '"macOS"' : (isWindows ? '"Windows"' : '"Linux"'),
            'Upgrade-Insecure-Requests': '1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
        };
    } else if (ua.includes('Firefox')) {
        // Firefox
        return {
            'User-Agent': ua,
            'Upgrade-Insecure-Requests': '1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
        };
    } else {
        // Safari/Edge/其他
        return {
            'User-Agent': ua,
            'Upgrade-Insecure-Requests': '1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
        };
    }
};
