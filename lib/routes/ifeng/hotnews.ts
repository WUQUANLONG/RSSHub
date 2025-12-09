import { Route } from '@/types';
import got from '@/utils/got';


export const route: Route = {
    path: '/hotnews',
    name: '首页热点咨询',
    maintainers: ['wuquanlong'],
    handler,
};

async function handler(ctx) {
    const baseUrl = 'https://www.ifeng.com/';
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    try {
        // 获取页面数据
        const response = await got.get(baseUrl, {
            headers: {
                'User-Agent': userAgent,
            },
            timeout: 10000, // 添加超时设置
        });

        // 提取数据
        const allData = extractAllData(response.data);

        // 验证数据完整性
        if (!allData || !allData.hotNews1 || !Array.isArray(allData.hotNews1) || allData.hotNews1.length === 0) {
            return {
                title: '凤凰网-热点资讯',
                link: baseUrl,
                item: [],
                description: '未获取到热点新闻数据，请稍后重试',
            };
        }

        console.log(`成功获取 ${allData.hotNews1.length} 条热点新闻`);

        // 生成RSS条目
        const items = allData.hotNews1
            .filter(item => item && item.title && item.url) // 过滤无效数据
            .map((item, index) => {
                const pubDate = parseNewsTime(item.newsTime);
                const description = generateDescription(item);

                return {
                    title: item.title || `凤凰热点新闻 ${index + 1}`,
                    link: normalizeUrl(item.url, baseUrl),
                    pubDate: pubDate,
                    description: description,
                    author: '凤凰网',
                    category: item.category || '热点',
                };
            })
            .filter(item => item.title && item.link); // 确保必要的字段存在

        if (items.length === 0) {
            return {
                title: '凤凰网-热点资讯',
                link: baseUrl,
                item: [],
                description: '解析到的新闻数据不完整，请稍后重试',
            };
        }

        return {
            title: '凤凰网-热点资讯',
            link: baseUrl,
            item: items,
            description: `每日热点资讯，共 ${items.length} 条新闻`,
        };

    } catch (error) {
        console.error('获取凤凰网数据失败:', error.message);

        return {
            title: '凤凰网-热点资讯',
            link: baseUrl,
            item: [],
            description: `获取数据失败：${error.message}，请稍后重试`,
        };
    }
}

/**
 * 从HTML中提取allData数据
 */
function extractAllData(html) {
    try {
        const regex = /var allData\s*=\s*(\{[\s\S]*?\});/;
        const match = html.match(regex);

        if (!match || !match[1]) {
            console.warn('未找到allData数据');
            return null;
        }

        // 清理可能的JavaScript注释和不安全字符
        const cleanedJson = match[1]
            .replace(/\/\/.*(?=\n)/g, '') // 移除单行注释
            .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
            .trim();

        const jsonObj = JSON.parse(cleanedJson);

        // 验证必要的数据结构
        if (!jsonObj || typeof jsonObj !== 'object') {
            console.warn('解析的allData不是有效对象');
            return null;
        }

        return jsonObj;
    } catch (error) {
        console.error('解析allData数据失败:', error.message);
        return null;
    }
}

/**
 * 解析新闻时间
 */
function parseNewsTime(timeString) {
    if (!timeString) {
        return new Date().toUTCString();
    }

    try {
        // 尝试多种时间格式
        const normalizedTime = timeString.replace(/-/g, '/');
        const date = new Date(normalizedTime);

        // 验证日期是否有效
        if (isNaN(date.getTime())) {
            console.warn(`无效的日期格式: ${timeString}`);
            return new Date().toUTCString();
        }

        return date.toUTCString();
    } catch (error) {
        console.warn(`解析日期失败: ${timeString}`, error.message);
        return new Date().toUTCString();
    }
}

/**
 * 生成描述内容
 */
function generateDescription(item) {
    let description = item.title || '';

    // 添加缩略图
    if (item.thumbnail) {
        const thumbnailUrl = normalizeUrl(item.thumbnail, 'https:');
        description = `<img src="${thumbnailUrl}" alt="${item.title || '新闻图片'}" style="max-width: 100%;"><br>${description}`;
    }

    // 如果有摘要，添加到描述中
    if (item.summary) {
        description += `<br><br>${item.summary}`;
    }

    return description;
}

/**
 * 规范化URL
 */
function normalizeUrl(url, prefix = '') {
    if (!url) {
        return '';
    }

    // 处理相对URL
    if (url.startsWith('//')) {
        return 'https:' + url;
    }

    if (url.startsWith('/')) {
        return prefix + url;
    }

    return url;
}
