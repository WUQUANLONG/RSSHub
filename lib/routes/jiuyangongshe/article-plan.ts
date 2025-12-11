import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import md5 from '@/utils/md5';

interface ArticlePlanItem {
    article_id: string;
    title: string;
    content: string;
    create_time: string;
    nickname: string;
    avatar: string;
    stock_name: string;
    hot: number;
    total_hot: number;
    like_count: number;
    forward_count: number;
    comment_count: number;
    browsers_count: number;
    keyword?: string;
    imgs?: string;
}

interface ApiResponse {
    msg: string;
    data: {
        pageNo: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
        result: ArticlePlanItem[];
    };
    errCode: string;
    serverTime: number;
}

export const route: Route = {
    path: '/article/plan/:page?/:orderBy?',
    categories: ['finance'],
    example: '/jiuyangongshe/article/plan',
    parameters: {
        page: {
            description: '页码，从1开始，默认为1',
            optional: true,
        },
        orderBy: {
            description: '排序方式: stock_hot (股票热度), article_hot (文章热度), newest (最新)',
            optional: true,
            default: 'stock_hot',
        },
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
            source: ['jiuyangongshe.com/article/plan'],
            target: '/article/plan',
        },
    ],
    maintainers: ['wuquanlong'],
    name: '文章计划',
    handler,
};

async function handler(ctx) {
    // First try to get parameters from query string (takes precedence)
    const queryPage = ctx.req.query('page');
    const queryOrderBy = ctx.req.query('orderBy');

    // Then try to get from path parameters
    const { page: pathPage = 1, orderBy: pathOrderBy = 'stock_hot' } = ctx.req.param();

    // Use query parameters if available, otherwise fall back to path parameters
    const page = queryPage || pathPage;
    const orderBy = queryOrderBy || pathOrderBy;

    const time = String(Date.now());

    // Validate orderBy parameter
    const validOrderBy = ['stock_hot', 'article_hot', 'newest'];
    const orderParam = validOrderBy.includes(orderBy) ? orderBy : 'stock_hot';

    const response: ApiResponse = await ofetch('https://app.jiuyangongshe.com/jystock-app/api/v1/article/plan/page', {
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
            content: '',
            keyword: '',
            limit: 15,
            logic: '1',
            nickname: '',
            order: '',
            orderBy: orderParam,
            start: Number.parseInt(page),
            stock_direction: '',
            stock_name: '',
        },
    });

    // 检查API响应状态
    if (response.errCode !== '0') {
        throw new Error(`API请求失败: ${response.msg || '未知错误'}`);
    }

    // 获取数据列表
    const itemList = response.data?.result || [];

    if (itemList.length === 0) {
        return {
            title: '文章计划 - 韭研公社',
            link: 'https://www.jiuyangongshe.com/article/plan',
            description: '韭研公社-研究共享，茁壮成长（原韭菜公社）文章计划',
            language: 'zh-cn',
            item: [],
        };
    }

    const items = itemList.map((item) => ({
        title: item.title || `文章: ${item.stock_name}`,
        link: `https://www.jiuyangongshe.com/article/${item.article_id}`,
        description: item,
        pubDate: parseDate(item.create_time),
        author: item.nickname || undefined,
        guid: `jiuyangongshe-article-plan-${item.article_id}`,
    }));

    return {
        title: '文章计划 - 韭研公社',
        link: 'https://www.jiuyangongshe.com/article/plan',
        description: '韭研公社-研究共享，茁壮成长（原韭菜公社）文章计划',
        language: 'zh-cn',
        item: items,
    };
}

