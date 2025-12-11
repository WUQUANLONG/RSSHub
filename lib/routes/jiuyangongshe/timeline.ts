import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import md5 from '@/utils/md5';

interface ResultItemList {
    article_id: string;
    comment_count: number;
    content: string;
    create_time: string;
    forward_count: number;
    is_like: number;
    is_step: number;
    like_count: number;
    title: string;
    timeline: {
        article_id: string;
        timeline_id: string;
        date: string;
        grade: number;
        source: string;
        create_time: string;
        theme_list: [
            {
                timeline_theme_id: string;
                name: string;
            },
        ];
    };
    user: {
        user_id: string;
        nickname: string;
    };
    user_id: string;
    keyword?: string;
    imgs?: string;
    browsers_count?: number;
    is_top?: number;
}
interface ResultItem {
    date: string;
    list: ResultItemList[];
}

interface ApiResponse {
    msg: string;
    data: ResultItem[];
    errCode: string;
    serverTime: number;
}

export const route: Route = {
    path: '/timeline',
    categories: ['finance'],
    example: '/jiuyangongshe/timeline',
    parameters: {},
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
            source: ['jiuyangongshe.com/timeline'],
            target: '/timeline',
        },
    ],
    maintainers: ['wuquanlong'],
    name: '时间轴',
    handler,
};

async function handler() {
    const time = String(Date.now());

    const response: ApiResponse = await ofetch('https://app.jiuyangongshe.com/jystock-app/api/v1/timeline/list', {
        method: 'POST',
        headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            Origin: 'https://www.jiuyangongshe.com',
            Referer: 'https://www.jiuyangongshe.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            platform: '3',
            timestamp: time,
            token: md5(`Uu0KfOB8iUP69d3c:${time}`),
        },
        body: {
            date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        },
    });

    // 检查API响应状态
    if (response.errCode !== '0') {
        throw new Error(`API请求失败: ${response.msg || '未知错误'}`);
    }

    // 获取数据列表
    const itemList = response.data || [];

    if (itemList.length === 0) {
        return {
            title: '时间轴 - 韭研公社',
            link: 'https://www.jiuyangongshe.com/timeline',
            description: '韭研公社-研究共享，茁壮成长（原韭菜公社）时间轴',
            language: 'zh-cn',
            item: [],
        };
    }

    // Flatten the nested structure - each date item contains a list of articles
    const items = itemList.flatMap((dateItem) => {
        // 防御性编程：确保 dateItem 和 list 存在
        if (!dateItem?.list || !Array.isArray(dateItem.list)) {
            console.warn('Invalid dateItem structure:', dateItem);
            return [];
        }

        return dateItem.list.map((item) => {
            // 确保 item 有必要的属性
            if (!item) {
                console.warn('Empty item found in list');
                return null;
            }
            item.date = dateItem.date;
            try {
                return {
                    title: item.title || item.article_id || 'Untitled',
                    description: item,
                    pubDate: parseDate(item.create_time),
                    category: item.keyword ? [item.keyword.trim()] : undefined,
                    author: item.user?.nickname?.trim() || undefined,
                    guid: item.article_id || `unknown-${Date.now()}-${Math.random()}`,
                };
            } catch (error) {
                console.error('Error processing item:', item, error);
                return null;
            }
        }).filter((item): item is NonNullable<typeof item> => item !== null);
    });

    return {
        title: '时间轴 - 韭研公社',
        link: 'https://www.jiuyangongshe.com/timeline',
        description: '韭研公社-研究共享，茁壮成长（原韭菜公社）时间轴',
        language: 'zh-cn',
        item: items,
    };
}
