// rsshub/lib/routes/weibo/hot-search.ts

import { Route } from '@/types';
import got from '@/utils/got';
import { config } from '@/config';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/hot-search',
    categories: ['social-media'],
    example: '/weibo/hot-search',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['weibo.com/hot/search'],
            target: '/hot-search',
        },
    ],
    name: '热搜榜',
    maintainers: ['yourname'],
    handler,
    description: `获取微博实时热搜榜，每个热搜条目包含完整的JSON数据`,
};

async function handler() {
    try {
        // 生成随机UA
        const userAgents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
        ];
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

        // referer URL
        const refererUrl = 'https://weibo.com/newlogin?tabtype=search&gid=&openLoginLayer=0&url=https%3A%2F%2Fweibo.com%2F';

        // 尝试从环境变量获取cookie
        let cookies = config.weibo?.cookies || '';

        if (!cookies) {
            // 如果没有配置cookie，使用基础cookie
            cookies = 'XSRF-TOKEN=test; SUB=_2AkMeauV4f8NxqwFRmv4WzG3ibYx2zQ7EieKoNhSjJRMxHRl-yT9kqkUYtRB6NerLlwDHnhhutTYqsEl4YI6Jl4XW9lmY; SUBP=0033WrSXqPxfM72-Ws9jqgMF55529P9D9W5ShC8q.8lGhINgImWXb1OH;';
        }

        // 从cookie中提取XSRF-TOKEN
        let xsrfToken = 'C3OVn5Vxw-d5PoaJBGBwrqMS';
        const xsrfTokenMatch = cookies.match(/XSRF-TOKEN=([^;]+)/);
        if (xsrfTokenMatch) {
            xsrfToken = xsrfTokenMatch[1];
        }

        // 构造请求头
        const headers = {
            'accept': 'application/json, text/plain, */*',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'zh-CN,zh;q=0.9',
            'client-version': 'v2.47.139',
            'cookie': cookies,
            'priority': 'u=1, i',
            'referer': refererUrl,
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'server-version': 'v2025.12.04.5',
            'user-agent': userAgent,
            'x-requested-with': 'XMLHttpRequest',
            'x-xsrf-token': xsrfToken,
        };

        console.log('正在请求微博热搜API...');

        // 请求热搜API
        const apiResponse = await got({
            method: 'get',
            url: 'https://weibo.com/ajax/side/hotSearch',
            headers,
            timeout: 15000,
        });

        const data = apiResponse.data;
        const timestamp = Date.now();

        if (data && data.data && data.data.realtime && Array.isArray(data.data.realtime)) {
            const realtimeList = data.data.realtime;

            // 为每个热搜创建独立的条目
            const items = realtimeList.map((item, index) => ({
                title: `微博热搜 ${index + 1}`,
                description: JSON.stringify(item, null, 2),
                link: item.word_scheme
                    ? `https://s.weibo.com/${item.word_scheme}`
                    : `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word)}`,
                pubDate: parseDate(timestamp),
                guid: `weibo-hot-${item.word}-${timestamp}-${index}`,
            }));

            return {
                title: '微博热搜榜',
                link: 'https://weibo.com/hot/search',
                item: items,
                description: `微博实时热搜榜，共 ${realtimeList.length} 个热搜词`,
                allowEmpty: false,
            };
        } else {
            // 如果没有realtime数据，返回原始数据
            return {
                title: '微博热搜榜',
                link: 'https://weibo.com/hot/search',
                item: [
                    {
                        title: '微博热搜数据',
                        description: JSON.stringify(data, null, 2),
                        link: 'https://weibo.com/hot/search',
                        pubDate: parseDate(timestamp),
                    }
                ],
                description: '微博热搜API返回的原始数据',
            };
        }

    } catch (error) {
        console.error('获取微博热搜失败:', error.message);

        // 返回错误信息
        const errorData = {
            error: true,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        };

        return {
            title: '微博热搜榜',
            link: 'https://weibo.com/hot/search',
            item: [{
                title: '获取微博热搜失败',
                description: JSON.stringify(errorData, null, 2),
                link: 'https://weibo.com/hot/search',
                pubDate: parseDate(Date.now()),
            }],
            description: '微博热搜获取失败',
            allowEmpty: true,
        };
    }
}
