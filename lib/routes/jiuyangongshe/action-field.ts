import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import md5 from '@/utils/md5';
import { art } from '@/utils/render';
import path from 'node:path';
import cache from '@/utils/cache';

interface ActionInfo {
    article_id: string;
    action_info_id: string;
    stock_id: string;
    action_field_id: string;
    time: string;
    num: string;
    price: number;
    day: number;
    edition: number;
    shares_range: number;
    reason: string | null;
    expound: string;
    is_crawl: number;
    is_recommend: number;
    is_delete: string;
    delete_time: string | null;
    create_time: string;
    update_time: string | null;
    sort_no: number;
}

interface Article {
    code: string;
    name: string;
    article: {
        article_id: string;
        comment_count: number;
        like_count: number;
        create_time: string;
        user_id: string;
        is_like: number;
        action_info: ActionInfo;
        forward_count: number;
        step_count: number;
        title: string;
        is_step: number;
        user: {
            user_id: string;
            avatar: string;
            nickname: string;
        };
    };
}

interface DataItem {
    date: string;
    reason: string;
    action_field_id: string;
    name: string;
    count: number;
    list?: Article[];
    status?: number;
    sort_no?: number;
    is_delete?: string;
    delete_time?: string | null;
    create_time?: string;
    update_time?: string | null;
}

interface ApiResponse {
    msg: string;
    data: DataItem[];
    errCode: string;
    serverTime: number;
}

export const route: Route = {
    path: '/action/field',
    categories: ['finance'],
    example: '/jiuyangongshe/action/field',
    parameters: { date: '日期，格式 YYYY-MM-DD，默认为今天' },
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
            source: ['jiuyangongshe.com/actionField'],
            target: '/action/field',
        },
    ],
    maintainers: ['wuquanlong'],
    name: '题材概念',
    handler,
};

async function loginAndGetSession() {
    const user = process.env.JIUYANGONGSHE_USER;
    const password = process.env.JIUYANGONGSHE_PASSWORD;

    if (!user || !password) {
        throw new Error('JIUYANGONGSHE_USER and JIUYANGONGSHE_PASSWORD must be set in the environment variables');
    }

    const time = String(Date.now());

    const response = await ofetch('https://app.jiuyangongshe.com/jystock-app/api/v1/user/login', {
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
            phone: user,
            password,
        },
    });
    // Extract sessionToken from response data
    if (!response.data || !response.data.sessionToken) {
        throw new Error('Login failed: No sessionToken in response data');
    }

    return response.data.sessionToken;
}

async function handler(ctx) {
    const { date = formatToday() } = ctx.req.param();
    const pc = 1;

    // Get or refresh session from cache
    const sessionKey = 'jiuyangongshe:session';
    let session = await cache.get(sessionKey);

    if (!session) {
        session = await loginAndGetSession();
        // Cache session for 25 hours (less than 30 days to ensure refresh before expiration)
        await cache.set(sessionKey, session, 25 * 60 * 60);
    }

    const time = String(Date.now());
    const response: ApiResponse = await ofetch('https://app.jiuyangongshe.com/jystock-app/api/v1/action/field', {
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
            Cookie: `SESSION=${session}`,
        },
        body: {
            date,
            pc,
        },
    });

    // 检查API响应状态
    if (response.errCode !== '0') {
        // throw new Error(`API请求失败: ${response.msg || '未知错误'}`);
        throw new Error(`API请求失败: ${response.msg || '未知错误'}`);
    }
    // console.log('返回数据',response.data )
    // 获取数据列表
    const dataList = response.data || [];

    if (dataList.length === 0) {
        return {
            title: `题材概念 - 韭研公社`,
            link: 'https://www.jiuyangongshe.com/actionField',
            description: '韭研公社-研究共享，茁壮成长（原韭菜公社）题材概念',
            language: 'zh-cn',
            item: [],
        };
    }

    // 过滤掉没有list或count为0的项目
    const items = [];

    // 1. 收集所有需要并行处理的文章任务
    const articlePromises = [];

    for (const item of dataList) {
        if (item.count > 0 && item.list && item.list.length > 0) {
            // 分类主条目（同步处理）
            items.push({
                // title: `${item.name} (${item.count}个)` || `题材: ${item.action_field_id}`,
                title: item.name ? `${item.name} (${item.count}个)` : `题材: ${item.action_field_id}`,
                link: `https://www.jiuyangongshe.com/actionField?date=${date}&id=${item.action_field_id}`,
                description: generateCategoryDescription(item),
                pubDate: parseDate(`${item.date} 00:00:00`),
                category: [item.name],
                guid: `jiuyangongshe-action-field-${item.action_field_id}-${item.date}`,
            });

            for (const article of item.list) {
                // 使用function声明的IIFE
                articlePromises.push(
                    (async function () {
                        const description = await renderArticleDescription(article);

                        return {
                            title: generateArticleTitle(article),
                            link: `https://www.jiuyangongshe.com/article/${article.article.article_id}?from=timeline&channelId=${item.action_field_id}&date=${date}&code=${article.code}&name=${encodeURIComponent(article.name)}&type=1`,
                            description,
                            pubDate: parseDate(article.article.create_time),
                            category: [item.name, `价格: ¥${article.article.action_info.price / 100}`],
                            author: article.article.user.nickname || undefined,
                            guid: `jiuyangongshe-article-${article.article.article_id}`,
                        };
                    })()
                );
            }
        }
    }

    // 2. 并行执行所有文章处理任务
    const articleItems = await Promise.all(articlePromises);

    // 3. 合并结果
    items.push(...articleItems);

    return {
        title: `题材概念 - 韭研公社`,
        link: 'https://www.jiuyangongshe.com/actionField',
        description: '韭研公社-研究共享，茁壮成长（原韭菜公社）题材概念',
        language: 'zh-cn',
        item: items,
    };
}

function formatToday(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function generateCategoryDescription(item: DataItem): string {
    const descriptionParts = [ `<h3>${item.name} 题材</h3>`, `<p><strong>数量:</strong> ${item.count} 个相关股票</p>`];


    if (item.reason) {
        descriptionParts.push(`<p><strong>原因:</strong> ${item.reason}</p>`);
    }

    if (item.list && item.list.length > 0) {
        descriptionParts.push('<p><strong>相关股票:</strong></p>', '<ul>');
        for (const article of item.list.slice(0, 5)) {
            // 只显示前5个股票
            descriptionParts.push(`<li><a href="https://www.jiuyangongshe.com/article/${article.article.article_id}">${article.name} (${article.code})</a></li>`);
        }
        if (item.list.length > 5) {
            descriptionParts.push(`<li>... 及其他 ${item.list.length - 5} 个股票</li>`);
        }
        descriptionParts.push('</ul>');
    }

    return descriptionParts.join('');
}

function generateArticleTitle(article: Article): string {
    const actionInfo = article.article.action_info;
    return `[${article.name}] ${article.article.title} (${formatPrice(actionInfo.price)})`;
}

function formatPrice(price: number): string {
    return `¥${(price / 100).toFixed(2)}`;
}

async function renderArticleDescription(article: Article): Promise<string> {
    const params = {
        article,
    };
    return await art(path.join(__dirname, 'templates/article.art'), params);
}
