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
    const items = itemList.flatMap((dateItem) =>
        dateItem.list.map((item) => ({
            title: item.title || `文章: ${item.article_id}`,
            link: ``,
            description: generateItemDescription(item),
            pubDate: parseDate(item.create_time),
            category: item.keyword ? [item.keyword] : undefined,
            author: item.user?.nickname || undefined,
            guid: item.article_id,
        }))
    );

    return {
        title: '时间轴 - 韭研公社',
        link: 'https://www.jiuyangongshe.com/timeline',
        description: '韭研公社-研究共享，茁壮成长（原韭菜公社）时间轴',
        language: 'zh-cn',
        item: items,
    };
}

// 根据时间轴项目生成描述
function generateItemDescription(item: ResultItemList): string {
    const descriptionParts = [];

    // 添加标题
    if (item.title) {
        const titleStyle = [];
        if (item.timeline?.title_red === 1) {titleStyle.push('color: red;');}
        if (item.timeline?.title_bold === 1) {titleStyle.push('font-weight: bold;');}

        const styleAttr = titleStyle.length > 0 ? ` style="${titleStyle.join(' ')}"` : '';
        descriptionParts.push(`<h3${styleAttr}>${item.title}</h3>`);
    }

    // 添加关键词
    if (item.keyword) {
        descriptionParts.push(`<p><strong>关键词:</strong> ${item.keyword}</p>`);
    }

    // 添加作者
    if (item.user?.nickname) {
        descriptionParts.push(`<p><strong>作者:</strong> ${item.user.nickname}</p>`);
    }

    // 添加图片
    if (item.imgs && item.imgs !== '[]') {
        try {
            const imgs = JSON.parse(item.imgs);
            if (Array.isArray(imgs) && imgs.length > 0) {
                for (const img of imgs) {
                    if (img) {
                        descriptionParts.push(`<p><img src="${img}" alt="图片" style="max-width: 100%; height: auto;" /></p>`);
                    }
                }
            }
        } catch {
            // 如果JSON解析失败，忽略图片
        }
    }

    // 添加内容预览
    if (item.content) {
        const contentPreview = item.content.length > 300 ? `${item.content.slice(0, 300)}...` : item.content;
        descriptionParts.push(`<div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px;">${contentPreview.replaceAll('\n', '<br/>')}</div>`);
    }

    // 添加统计信息
    const stats = [];
    if (item.forward_count) {stats.push(`转发: ${item.forward_count}`);}
    if (item.browsers_count) {stats.push(`浏览: ${item.browsers_count}`);}
    if (stats.length > 0) {
        descriptionParts.push(`<p><small>${stats.join(' | ')}</small></p>`);
    }

    // 添加置顶标识
    if (item.is_top === 1) {
        descriptionParts.push('<p><strong>🔝 置顶</strong></p>');
    }

    // 添加创建时间
    if (item.create_time) {
        descriptionParts.push(`<p><small>发布时间: ${item.create_time}</small></p>`);
    }

    return descriptionParts.join('');
}
