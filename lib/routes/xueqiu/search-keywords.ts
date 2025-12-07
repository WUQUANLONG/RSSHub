import { Route } from '@/types';
import got from '@/utils/got';
import logger from '@/utils/logger';
import { getDataWithPuppeteer, generateRandomString, getSearchApiCookies} from './cookies2';

// 导入本地工具
import { get_md5_1038 } from './md5_utils';

export const route: Route = {
    path: '/search',
    categories: ['finance'],
    example: '/xueqiu/search',
    parameters: {
        q: {
            description: '关键字',
            type: 'string',
            required: true,
        },
        page: {
            description: '页码，默认从1开始，最大不超过返回的maxPage',
            type: 'string',
            required: false,
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: true,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['xueqiu.com/'],
            target: '/search',
        },
    ],
    name: '关键字搜索框',
    maintainers: ['wuquanlong'],
    handler,
};


async function handler(ctx) {
    const { q, page = '1' } = ctx.req.query();

    try {
        // 方法1：尝试使用完整的签名逻辑
        return await searchWithFullSignature(q, page);
    } catch (error) {
        logger.error('签名方法失败，尝试备用方法:', error);

        // 方法2：回退到 Puppeteer
        return await getSearchResultsWithPuppeteer(q, page);
    }
}

// 使用完整签名的搜索函数
async function searchWithFullSignature(q: string, page: string) {
    const rootUrl = 'https://xueqiu.com';

    // 获取 WAF token 和 cookies（使用 livenews 的方法）
    const { wafToken, cookies, userAgent } = await getDataWithPuppeteer();

    // 生成随机字符串
    const randomString = generateRandomString(16);

    // 构建 API 路径
    const apiPath = `/query/v1/search/status.json?count=15&page=${page}&q=${encodeURIComponent(q)}&sortId=2`;

    // 生成带签名的完整 URL（使用和 livenews 相同的方法）
    const fullUrlWithMd5 = get_md5_1038(wafToken, randomString, apiPath, 'GET');

    logger.info(`搜索 API 签名 URL: ${fullUrlWithMd5.substring(0, 100)}...`);

    // 发送请求
    const response = await got({
        method: 'get',
        url: fullUrlWithMd5,
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Connection': 'keep-alive',
            'Cookie': cookies,
            'Host': 'xueqiu.com',
            'Referer': `${rootUrl}/k?q=${encodeURIComponent(q)}`,
            'User-Agent': userAgent,
            'X-Requested-With': 'XMLHttpRequest',
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
        },
        timeout: 30000,
    });

    // 解析响应
    let data;
    try {
        data = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    } catch (error) {
        logger.error('解析 JSON 失败:', error);
        logger.error('响应内容前500字符:', response.body.substring(0, 500));
        throw new Error('API 返回数据格式错误');
    }

    return processApiData(data, q);
}



// 处理 API 数据
function processApiData(data: any, q: string) {
    let items = [];
    const rootUrl = 'https://xueqiu.com';

    if (data.list && Array.isArray(data.list)) {
        items = data.list;
    } else if (data.items && Array.isArray(data.items)) {
        items = data.items;
    } else if (Array.isArray(data)) {
        items = data;
    } else {
        logger.error('无法处理的数据格式:', data);
        items = [];
    }

    const processedItems = items.map((item: any) => {
        let link = rootUrl;
        if (item.id && item.user && item.user.id) {
            link = `${rootUrl}/${item.user.id}/${item.id}`;
        } else if (item.target) {
            link = item.target;
        }

        const text = item.text || item.description || '';
        const title = item.title || (text.length > 100 ? text.substring(0, 100) + '...' : text || `帖子 ${item.id}`);

        let pubDate;
        if (item.created_at) {
            pubDate = new Date(item.created_at);
        }

        return {
            title,
            description: `
                <p>${text.replace(/\n/g, '<br>')}</p>
                ${pubDate ? `<p><small>发布时间: ${pubDate.toLocaleString('zh-CN')}</small></p>` : ''}
                ${item.user ? `<p><small>作者: ${item.user.screen_name || item.user.name || '未知'}</small></p>` : ''}
            `,
            link,
            pubDate,
            author: item.user?.screen_name || item.user?.name || '雪球用户',
            guid: item.id,
            id: item.id,
        };
    });

    return {
        title: `雪球搜索 - ${q || '最新'}`,
        link: `https://xueqiu.com/k?q=${encodeURIComponent(q || '')}`,
        description: `雪球关键词搜索: ${q}`,
        item: processedItems,
    };
}

// 处理页面数据

