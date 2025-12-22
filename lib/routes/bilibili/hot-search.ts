import { Route } from '@/types';
import got from '@/utils/got';
import { formatDate } from '@/utils/parse-date';
import cache from './cache';
import utils from './utils';

interface TrendingItem {
    keyword: string;
    show_name: string;
    icon: string;
    uri: string;
    goto: string;
    heat_score: number;
}

interface TrendingData {
    title: string;
    trackid: string;
    list: TrendingItem[];
    top_list: unknown[];
}

interface ApiResponse {
    code: number;
    message: string;
    ttl: number;
    data: {
        trending: TrendingData;
    };
}

export const route: Route = {
    path: '/hot-search',
    categories: ['social-media'],
    example: '/bilibili/hot-search',
    parameters: {
        limit: { description: '限制条数，默认20条，不超多40' },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['www.bilibili.com/', 'm.bilibili.com/'],
        },
    ],
    name: '热搜',
    maintainers: ['CaoMeiYouRen'],
    handler,
    url: 'www.bilibili.com/',
};

async function handler(ctx) {
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
    let limit= 20;
    if (queryParams.limit) {
        limit = queryParams.limit;
    }
    try {

        // 添加WBI验证信息
        // const params = utils.addWbiVerifyInfo(searchParams.toString(), wbiVerifyString);

        // 构建请求URL
        const apiUrl = `https://api.bilibili.com/x/web-interface/wbi/search/square?limit=${limit}`;

        // 发送请求
        const { data: responseData } = await got<ApiResponse>({
            method: 'get',
            url: apiUrl,
            headers: {

                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
        });

        // 检查API响应状态
        if (responseData.code !== 0) {
            throw new Error(`API Error: ${responseData.code} - ${responseData.message}`);
        }
        // console.log('返回数据', responseData);

        const { trending } = responseData.data;
        const { title = 'Bilibili热搜', list = [] } = trending || {};

        // 生成RSS项
        const items = list.map((item: TrendingItem) => {
            const searchUrl = `https://search.bilibili.com/all?${new URLSearchParams({
                keyword: item.keyword,
                from_source: 'webtop_search'
            })}`;

            const link = item.link || item.goto || searchUrl;

            if (item.heat_score) {
                item.view_count = item.heat_score;
            }
            if (item.show_name) {
                item.content = item.show_name;
            }

            return {
                title: item.keyword,
                //description: JSON.stringify(item, null, 2),
                description: item,
                link,
                guid: `bilibili-hotsearch-${item.keyword}`,
                // 这个热榜没有上榜时间
                pubDate: formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss'),
            };
        });

        return {
            title: `${title} - Bilibili`,
            link: apiUrl,
            description: 'Bilibili实时热搜榜单',
            item: items,
            allowEmpty: false,
        };
    } catch (error) {
        // 错误处理
        console.error('Bilibili Hot Search Error:', error);

        return {
            title: 'Bilibili热搜 - 获取失败',
            link: 'https://www.bilibili.com',
            description: '获取热搜数据失败，请稍后重试',
            item: [],
            allowEmpty: true,
        };
    }
}
