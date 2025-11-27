import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import md5 from '@/utils/md5';

interface ResultItem {
    industry_id: string;
    title_red: number;
    title_bold: number;
    title: string;
    author: null | string;
    imgs: string;
    keyword: string;
    content: string;
    is_top: number;
    status: number;
    sort_no: number;
    forward_count: number;
    browsers_count: number;
    is_delete: string;
    delete_time: null | string;
    create_time: string;
    update_time: string;
}

interface ApiResponse {
    msg: string;
    data: {
        pageNo: number;
        pageSize: number;
        orderBy: null | string;
        order: null | string;
        autoCount: boolean;
        map: null | any;
        params: string;
        result: ResultItem[];
        totalCount: number;
        first: number;
        totalPages: number;
        hasNext: boolean;
        nextPage: number;
        hasPre: boolean;
        prePage: number;
    };
    errCode: string;
    serverTime: number;
}

export const route: Route = {
    path: '/industry/list',
    categories: ['finance'],
    example: '/jiuyangongshe/industry/list',
    parameters: {
        limit: '返回数量，默认为30',
        start: '起始位置，默认为1',
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
            source: ['jiuyangongshe.com/industryChain'],
            target: '/industry/list',
        },
    ],
    maintainers: ['wuquanlong'],
    name: '产业库',
    handler,
};

async function handler(ctx) {
    const { limit = '30', start = '1' } = ctx.req.param();

    const time = String(Date.now());

    const response: ApiResponse = await ofetch('https://app.jiuyangongshe.com/jystock-app/api/v1/industry/list', {
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
            keyword: '',
            start: Number.parseInt(start, 10),
            limit: Number.parseInt(limit, 10),
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
            title: '产业库 - 韭研公社',
            link: 'https://www.jiuyangongshe.com/industryChain',
            description: '韭研公社-研究共享，茁壮成长（原韭菜公社）产业库',
            language: 'zh-cn',
            item: [],
        };
    }

    const items = itemList.map((item) => ({
        title: item.title || `行业: ${item.industry_id}`,
        link: `https://www.jiuyangongshe.com/industryChain/${item.industry_id}`,
        description: generateItemDescription(item),
        pubDate: parseDate(item.create_time),
        category: item.keyword ? [item.keyword] : undefined,
        author: item.author || undefined,
        guid: `jiuyangongshe-industry-${item.industry_id}-${item.create_time}`,
    }));

    return {
        title: '产业库 - 韭研公社',
        link: 'https://www.jiuyangongshe.com/industryChain',
        description: '韭研公社-研究共享，茁壮成长（原韭菜公社）产业库',
        language: 'zh-cn',
        item: items,
    };
}

function generateItemDescription(item: ResultItem): string {
    const descriptionParts = [];

    // 添加标题
    if (item.title) {
        const titleStyle = [];
        if (item.title_red === 1) {titleStyle.push('color: red;');}
        if (item.title_bold === 1) {titleStyle.push('font-weight: bold;');}

        const styleAttr = titleStyle.length > 0 ? ` style="${titleStyle.join(' ')}"` : '';
        descriptionParts.push(`<h3${styleAttr}>${item.title}</h3>`);
    }

    // 添加关键词
    if (item.keyword) {
        descriptionParts.push(`<p><strong>关键词:</strong> ${item.keyword}</p>`);
    }

    // 添加作者
    if (item.author) {
        descriptionParts.push(`<p><strong>作者:</strong> ${item.author}</p>`);
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
