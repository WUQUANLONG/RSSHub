import { Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
import { parseDate } from '@/utils/parse-date';
import ofetch from '@/utils/ofetch';

const __dirname = getCurrentPath(import.meta.url);

export const route: Route = {
    path: '/hotnews',
    categories: ['new-media', 'popular'],
    example: '/toutiao/hotnews',
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
            source: ['toutiao.com/hot-event/hot-board/', 'toutiao.com/'],
            target: '/hotnews',
        },
    ],
    name: '热榜',
    maintainers: ['your-name'],
    handler,
    description: '获取今日头条热榜数据，包含实时热点事件',
};

interface HotBoardItem {
    ClusterId: number;
    ClusterIdStr: string;
    Title: string;
    Label: string;
    LabelDesc: string;
    LabelUrl?: string;
    LabelUri?: {
        uri: string;
        url: string;
        url_list: Array<{ url: string }>;
    };
    Url: string;
    HotValue: string;
    QueryWord: string;
    InterestCategory: string[];
    Image?: {
        uri: string;
        url: string;
        width: number;
        height: number;
        url_list: Array<{ url: string }>;
    };
    ClusterType: number;
    Schema?: string;
}

interface HotBoardResponse {
    data: HotBoardItem[];
    fixed_top_data?: HotBoardItem[];
    message?: string;
    code?: number;
}

async function handler(ctx) {
    const baseUrl = 'https://www.toutiao.com';
    const apiUrl = `${baseUrl}/hot-event/hot-board/?origin=toutiao_pc`;

    try {
        console.log(`请求热榜API: ${apiUrl}`);

        // 获取热榜数据
        const response = await ofetch<HotBoardResponse>(apiUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': baseUrl,
                'Origin': baseUrl,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
            },
        });

        console.log(`API响应状态: ${response.code || 200}, 数据条数: ${response.data?.length || 0}`);

        // 处理数据
        const items = [];

        if (response.data && Array.isArray(response.data)) {
            console.log(`开始处理 ${response.data.length} 条热榜数据`);

            // 处理主要数据
            response.data.forEach((item, index) => {
                if (!item || !item.Title) return;

                const title = item.Title;
                const link = item.Url || `${baseUrl}/trending/${item.ClusterIdStr || item.ClusterId}/`;
                const hotValue = item.HotValue ? parseInt(item.HotValue).toLocaleString('zh-CN') : '';
                const labelDesc = item.LabelDesc || '';
                const categories = item.InterestCategory?.join('、') || '';

                // 获取图片URL
                let imageUrl = '';
                if (item.Image?.url) {
                    imageUrl = item.Image.url;
                } else if (item.LabelUri?.url) {
                    imageUrl = item.LabelUri.url;
                } else if (item.LabelUrl) {
                    imageUrl = item.LabelUrl;
                }

                // 构造描述

                //const description = JSON.stringify(item, null, 2);

                items.push({
                    title: `${index + 1}. ${title}`,
                    link: link,
                    description: item,
                    pubDate: parseDate(new Date()),
                    guid: `toutiao-hot-${item.ClusterIdStr || index}-${Date.now()}`,
                    category: item.InterestCategory,
                });
            });

            // 如果有置顶数据，也添加进去
            if (response.fixed_top_data && Array.isArray(response.fixed_top_data)) {
                response.fixed_top_data.forEach((item, index) => {
                    if (!item || !item.Title) return;

                    const title = `🔝 ${item.Title}`;
                    const link = item.Url || `${baseUrl}/trending/${item.ClusterIdStr || item.ClusterId}/`;
                    // const description = JSON.stringify(item, null, 2);

                    items.push({
                        title: title,
                        link: link,
                        description: item,
                        pubDate: parseDate(new Date()),
                        guid: `toutiao-fixed-${item.ClusterIdStr || index}-${Date.now()}`,
                    });
                });
            }

            console.log(`成功处理 ${items.length} 条数据`);

        } else {
            console.warn('API返回数据格式异常:', response);
            throw new Error('API返回数据格式异常');
        }

        // 限制返回数量，最多30条
        const finalItems = items.slice(0, 30);

        return {
            title: '今日头条热榜',
            link: apiUrl,
            item: finalItems,
            description: '今日头条实时热榜，包含最新热点事件和热门话题',
            language: 'zh-cn',
            image: 'https://sf1-ttcdn-tos.pstatp.com/obj/ttfe/pgcfe/toutiao_web_icon.png',
        };

    } catch (error) {
        console.error('获取热榜数据失败:', error);

        // 返回错误信息，但保持 RSS 格式
        return {
            title: '今日头条热榜',
            link: apiUrl,
            item: [{
                title: '获取热榜数据失败',
                link: apiUrl,
                description: `错误信息: ${error.message}<br>请稍后重试或访问原网站查看。`,
                pubDate: parseDate(new Date()),
            }],
            description: '获取今日头条热榜数据时发生错误',
            language: 'zh-cn',
            allowEmpty: true,
        };
    }
}
