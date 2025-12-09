import { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';
import ofetch from '@/utils/ofetch';
export const route: Route = {
    path: '/events',
    categories: ['other'],
    example: '/polymarket/events?closed=true&order=endDate&end_date_min=2025-11-18&limit=30',
    parameters: {
        closed: { description: '是否显示已关闭的事件' },
        order: { description: '排序字段' },
        start_date_min: { description: '开始日期最小值' },
        start_date_max: { description: '开始日期最大值' },
        end_date_min: { description: '结束日期最小值' },
        end_date_max: { description: '结束日期最大值' },
        limit: { description: '返回数量限制' },
        offset: { description: '偏移量' },
        ascending: { description: '是否升序' }
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
        supportCache: false,
    },
    name: 'Events',
    maintainers: ['WUQUANLONG'],
    handler,
};

async function handler(ctx) {
    console.log('=== 开始处理 Polymarket 请求 ===');

    const baseUrl = 'https://gamma-api.polymarket.com';

    // 获取原始请求参数
    let queryParams = {};

    try {
        const rawReq = ctx.req?.originalReq || ctx.req;

        if (rawReq && rawReq.url) {
            console.log('原始请求 URL:', rawReq.url);

            const url = new URL(rawReq.url, 'http://localhost');
            queryParams = Object.fromEntries(url.searchParams);
            console.log('解析到的参数:', queryParams);
        }
    } catch (error) {
        console.log('参数解析失败:', error.message);
    }

    // 构建 API 查询参数
    const apiQueryParams = new URLSearchParams();

    // 添加用户传入的参数
    if (queryParams.closed) {
        apiQueryParams.append('closed', queryParams.closed);
    }

    if (queryParams.order) {
        apiQueryParams.append('order', queryParams.order);
    } else {
        // 使用 date-fns 获取昨天日期
        const yesterday = subDays(new Date(), 1);
        const formattedDate = format(yesterday, 'yyyy-MM-dd');
        apiQueryParams.append('end_date_min', formattedDate);
    }

    if (queryParams.limit) {
        apiQueryParams.append('limit', queryParams.limit);
    } else {
        apiQueryParams.append('limit', '50');
    }
    if (queryParams.end_date_min) {
        apiQueryParams.append('end_date_min', queryParams.end_date_min);
    } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // 格式化为 YYYY-MM-DD
        const year = yesterday.getFullYear();
        const month = String(yesterday.getMonth() + 1).padStart(2, '0');
        const day = String(yesterday.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;

        apiQueryParams.append('end_date_min', formattedDate);
    }

    // 添加其他可选参数
    if (queryParams.start_date_min) apiQueryParams.append('start_date_min', queryParams.start_date_min);
    if (queryParams.start_date_max) apiQueryParams.append('start_date_max', queryParams.start_date_max);

    if (queryParams.end_date_max) apiQueryParams.append('end_date_max', queryParams.end_date_max);
    if (queryParams.offset) apiQueryParams.append('offset', queryParams.offset);
    if (queryParams.ascending) apiQueryParams.append('ascending', queryParams.ascending);

    const apiUrl = `${baseUrl}/events?${apiQueryParams.toString()}`;

    console.log('最终 API URL:', apiUrl);

    try {
        const response = await ofetch(apiUrl, {
            timeout: 30000,
            // 禁用缓存的关键配置
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
        });

        const itemList = Array.isArray(response) ? response :
            (response.events || response.results || response.items || []);

        console.log(`成功获取到 ${itemList.length} 个事件`);

        const items = itemList.map((item) => ({
            title: item.title || `Event: ${item.id}`,
            link: `https://polymarket.com/event/${item.slug || item.id}`,
            description: generateItemDescription(item),
            pubDate: parseDate(item.createdAt || item.startDate),
            category: item.tags ? [item.tags] : [],
            guid: item.id,
        }));

        // 返回结果，设置较短的缓存时间
        return {
            title: 'Polymarket Events',
            link: `https://polymarket.com/events?${apiQueryParams.toString()}`,
            description: `Polymarket 事件列表 - 共 ${itemList.length} 个事件`,
            item: items,
            // 关键：设置较短的缓存时间（单位：秒）
            allowEmpty: false,
        };
    } catch (error) {
        console.error('Polymarket API 请求失败:', error);
        throw new Error(`Failed to fetch Polymarket events: ${error.message}`);
    }
}

function generateItemDescription(event: any) {
    // 创建数据的深拷贝
    const eventData = JSON.parse(JSON.stringify(event));

    // 清理数据：移除 null/undefined/空字符串
    Object.keys(eventData).forEach(key => {
        if (eventData[key] === null || eventData[key] === undefined || eventData[key] === '') {
            delete eventData[key];
        }
    });

    try {
        const jsonData = JSON.stringify(eventData, null, 2);
        return jsonData;
    } catch (error) {
        console.log('JSON 序列化失败:', error);
        return `数据序列化错误: ${error.message}`;
    }
}
