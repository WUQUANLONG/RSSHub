import { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import logger from '@/utils/logger';
import { getDataWithPuppeteer, generateRandomString} from './cookies2';

// 导入本地工具
import { get_md5_1038 } from './md5_utils';

export const route: Route = {
    path: '/livenews/:max_id?',
    categories: ['finance'],
    example: '/xueqiu/livenews',
    parameters: {
        max_id: {
            description: '分页参数，从上一页的 next_max_id 获取',
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
            target: '/livenews',
        },
    ],
    name: '7x24 新闻',
    maintainers: ['your-username'],
    handler,
};

async function handler(ctx) {
    const { max_id } = ctx.req.param();
    const rootUrl = 'https://xueqiu.com';

    // 使用 Puppeteer 获取完整的 cookies 和 WAF token
    const { wafToken, cookies, userAgent } = await getDataWithPuppeteer();

    // logger.info('获取到 WAF token:', wafToken.substring(0, 30) + '...');
    // logger.info('获取到 cookies 数量:', cookies.split(';').length);

    // 生成随机字符串 (16位)
    const randomString = generateRandomString(16);

    // 构建基础请求路径
    let apiPath = '/statuses/livenews/list.json?count=15';
    if (max_id) {
        apiPath += `&max_id=${max_id}`;
    } else {
        apiPath += '&max_id=';
    }

    // 生成包含 md5__1038 参数的完整 URL
    const fullUrlWithMd5 = get_md5_1038(
        wafToken,
        randomString,
        apiPath,
        'GET'
    );

    logger.info(`生成的完整 URL: ${fullUrlWithMd5}`);

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
            'Referer': rootUrl,
            'User-Agent': userAgent,
            'X-Requested-With': 'XMLHttpRequest',
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
        },
        agent: false,
        timeout: 30000,
    });

    // logger.info('响应状态码:', response.statusCode);

    // 解析响应数据
    let data;
    try {
        data = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    } catch (error) {
        logger.error('解析 JSON 失败:', error);
        logger.error('响应内容:', response.body.substring(0, 500));
        throw new Error('API 返回数据格式错误');
    }

    if (!data || !Array.isArray(data.items)) {
        logger.error('API 返回数据格式错误:', data);
        throw new Error('API 返回数据格式错误');
    }

    logger.info('获取到数据项数量:', data.items.length);

    // 处理数据项
    const items = data.items.map((item) => {
        // 构建新闻链接
        let link;
        if (item.target) {
            link = item.target;
        } else if (item.status_id) {
            link = `${rootUrl}/status/${item.status_id}`;
        } else {
            link = `${rootUrl}/`;
        }

        // 处理新闻文本
        const text = item.text || '';
        const title = text.length > 100 ? text.substring(0, 100) + '...' : text || `新闻 ${item.id}`;

        // 格式化发布时间
        let pubDate;
        if (item.created_at) {
            pubDate = parseDate(item.created_at);
        }

        return {
            title,
            description: `
                <p>${text.replace(/\n/g, '<br>')}</p>
                ${pubDate ? `<p><small>发布时间: ${pubDate.toLocaleString()}</small></p>` : ''}
            `,
            link,
            pubDate,
            author: '雪球财经',
            guid: item.id,
            id: item.id,
        };
    });

    // 构建返回结果
    const result: any = {
        title: '雪球 7x24 新闻',
        link: `${rootUrl}/`,
        description: '雪球财经 7x24 小时新闻快讯',
        item: items,
    };

    // 如果有下一页，添加 next_max_id 信息
    if (data.next_max_id) {
        result.next_max_id = data.next_max_id;
    }

    return result;
}
