import UserAgent from 'user-agents';

// 创建匹配你需求的 UA 生成器
const createRandomUA = () => {
    // 限制在桌面端 Chrome/Edge
    const userAgent = new UserAgent({
        deviceCategory: 'desktop',
        platform: /(Windows|Macintosh|Linux)/,
        browser: /(Chrome|Edge)/,
    });

    return userAgent;
};

// 获取完整的请求头对象
export function getRandomHeaders() {
    const ua = createRandomUA();

    // 解析 UA 字符串获取版本信息
    const uaString = ua.toString();
    let browserName = 'Chrome';
    let browserVersion = '140.0.0.0';
    let platform = 'macOS';

    // 简单的解析逻辑（实际使用时可以更精确）
    if (uaString.includes('Edg')) {
        browserName = 'Google Chrome';
        browserVersion = uaString.match(/Edg\/(\d+\.\d+\.\d+)/)?.[1] || '140.0.0.0';
    } else if (uaString.includes('Chrome')) {
        browserName = 'Chromium';
        browserVersion = uaString.match(/Chrome\/(\d+\.\d+\.\d+)/)?.[1] || '140.0.0.0';
    }

    if (uaString.includes('Windows')) {
        platform = 'Windows';
    } else if (uaString.includes('Mac')) {
        platform = 'macOS';
    } else if (uaString.includes('Linux')) {
        platform = 'Linux';
    }

    // 构建匹配的 Sec-Ch-Ua 字符串
    const secChUa = `"${browserName}";v="${browserVersion.split('.')[0]}", "Not=A?Brand";v="24", "Google Chrome";v="${browserVersion.split('.')[0]}"`;
    return {'User-Agent': uaString, 'Sec-Ch-Ua': secChUa, 'Sec-Ch-Ua-Platform': `"${platform}"`};

    // return {
    //     'User-Agent': uaString,
    //     'Sec-Ch-Ua': secChUa,
    //     'Sec-Ch-Ua-Mobile': '?0',
    //     'Sec-Ch-Ua-Platform': `"${platform}"`,
    //     'Upgrade-Insecure-Requests': '1',
    //     'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    //     'Sec-Fetch-Site': 'same-site',
    //     'Sec-Fetch-Mode': 'cors',
    //     'Sec-Fetch-User': '?1',
    //     'Sec-Fetch-Dest': 'document',
    //     'Accept-Encoding': 'gzip, deflate, br, zstd',
    //     'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8',
    //     'Connection': 'keep-alive',
    //     'Cache-Control': 'max-age=0',
    //     'Referer': 'http://news.10jqka.com.cn/',
    // };
}
