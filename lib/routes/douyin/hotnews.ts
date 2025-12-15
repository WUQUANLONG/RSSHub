import { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';
import ofetch from '@/utils/ofetch';
import cache from '@/utils/cache';

export const route: Route = {
    path: '/hotnews',
    categories: ['social-media', 'popular'],
    example: '/douyin/hotnews',
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
            source: ['douyin.com/hot'],
            target: '/douyin/hotnews',
        },
    ],
    name: '抖音热搜',
    maintainers: ['your-name'],
    handler,
    description: '获取抖音实时热搜榜数据',
};

// 定义响应数据类型
interface DouyinHotItem {
    word: string;
    hot_value?: number;
    position?: number;
    video_count?: number;
    label?: string;
    sentence_id?: string;
    real_time_hot_value?: number;
    event_time?: number;
    word_type?: number;
    hot_list_type?: number;
    view_count?: number;
    discussion_count?: number;
}

interface DouyinHotResponse {
    data: {
        word_list: DouyinHotItem[];
        billboard_data?: {
            top_words?: DouyinHotItem[];
        };
    };
    status_code: number;
}

async function handler() {
    const baseUrl = 'https://www.douyin.com';
    const apiUrl = `${baseUrl}/aweme/v1/web/hot/search/list/`;

    // 基础参数
    const params = {
        device_platform: 'webapp',
        aid: '6383',
        channel: 'channel_pc_web',
        detail_list: '1',
        source: '6',
        main_billboard_count: '5',
        pc_client_type: '1',
        version_code: '170400',
        version_name: '17.4.0',
    };

    try {
        // 使用缓存
        const data = await cache.tryGet('douyin:hotsearch', async () => {
            console.log('从API获取抖音热搜数据...');

            const response = await ofetch<DouyinHotResponse>(apiUrl, {
                query: params,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': `${baseUrl}/hot`,
                },
                timeout: 10000,
                retry: 2,
            });

            console.log('API响应状态码:', response.status_code);

            if (!response.data || !response.data.word_list) {
                throw new Error('API返回数据格式异常');
            }

            return {
                word_list: response.data.word_list,
                top_words: response.data.billboard_data?.top_words || [],
                timestamp: Date.now(),
            };
        }, 300, false); // 缓存5分钟

        console.log(`处理 ${data.word_list.length} 条热搜数据`);

        // 处理热搜词列表
        const items = data.word_list.map((item, index) => {
            const position = item.position || index + 1;

            // 简化的描述：直接JSON化item
            // const description = JSON.stringify(item, null, 2);

            return {
                title: `${position}. ${item.word}`,
                link: `${baseUrl}/search/${encodeURIComponent(item.word)}?type=general`,
                description: item,
                pubDate: parseDate(new Date()),
                guid: `douyin-hot-${item.sentence_id || item.word}`,
            };
        });

        // 如果有置顶榜单数据
        if (data.top_words && data.top_words.length > 0) {
            data.top_words.forEach((item, index) => {
                if (!item.word) return;

                const description = JSON.stringify(item, null, 2);

                items.push({
                    title: `${item.word}`,
                    link: `${baseUrl}/search/${encodeURIComponent(item.word)}?type=general`,
                    description: description,
                    pubDate: parseDate(new Date()),
                    guid: `douyin-top-${item.sentence_id || item.word}`,
                });
            });
        }

        // 如果没有数据
        if (items.length === 0) {
            items.push({
                title: '抖音热搜榜',
                link: `${baseUrl}/hot`,
                description: JSON.stringify({ error: '无数据' }),
                pubDate: parseDate(new Date()),
            });
        }

        return {
            title: '抖音热搜榜',
            link: `${baseUrl}/hot`,
            item: items.slice(0, 50),
            description: '抖音实时热搜榜，包含最新热门话题和挑战',
            language: 'zh-cn',
            updated: parseDate(data.timestamp),
        };

    } catch (error) {
        console.error('获取抖音热搜失败:', error);

        return {
            title: '抖音热搜榜',
            link: `${baseUrl}/hot`,
            item: [{
                title: '获取热搜数据失败',
                link: `${baseUrl}/hot`,
                description: JSON.stringify({
                    error: error.message,
                    timestamp: new Date().toISOString()
                }),
                pubDate: parseDate(new Date()),
            }],
            description: '获取抖音热搜数据时发生错误',
            language: 'zh-cn',
            allowEmpty: true,
        };
    }
}
