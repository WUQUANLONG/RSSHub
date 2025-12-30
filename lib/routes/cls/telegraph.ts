import { Route } from '@/types';

import got from '@/utils/got';
import {formatDate, parseDate} from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';

import { rootUrl, getSearchParams } from './utils';
import {getRandomHeaders} from "@/utils/random-ua";

const categories = {
    watch: '看盘',
    announcement: '公司',
    explain: '解读',
    red: '加红',
    jpush: '推送',
    remind: '提醒',
    fund: '基金',
    hk: '港股',
};

export const route: Route = {
    path: '/telegraph/:category?',
    categories: ['finance'],
    example: '/cls/telegraph',
    parameters: { category: '分类，见下表，默认为全部' },
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
            source: ['cls.cn/telegraph', 'cls.cn/'],
            target: '/telegraph',
        },
    ],
    name: '电报',
    maintainers: ['nczitzk'],
    handler,
    url: 'cls.cn/telegraph',
    description: `| 看盘  | 公司         | 解读    | 加红 | 推送  | 提醒   | 基金 | 港股 |
| ----- | ------------ | ------- | ---- | ----- | ------ | ---- | ---- |
| watch | announcement | explain | red  | jpush | remind | fund | hk   |`,
};

async function handler(ctx) {
    const category = ctx.req.param('category') ?? '';
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 50;

    let apiUrl = `${rootUrl}/nodeapi/updateTelegraphList`;
    if (category) {
        apiUrl = `${rootUrl}/v1/roll/get_roll_list`;
    }

    const currentUrl = `${rootUrl}/telegraph`;
    const ua = getRandomHeaders();
    const referer = 'https://www.cls.cn/';

    const response = await got({
        method: 'get',
        url: apiUrl,
        searchParams: getSearchParams({
            category,
            hasFirstVipArticle: 1,
        }),
        headers: {
            ...ua,
            'Referer': referer,
        },
    });

    const items = response.data.data.roll_data.slice(0, limit).map((item) => {
        // 创建格式化后的时间变量，不修改原始对象
        const formattedCtime = formatDate(parseDate(item.ctime * 1000));
        const formattedModifiedTime = item.modified_time
            ? formatDate(parseDate(item.modified_time * 1000))
            : '';
        let tmp = item
        let metrics = {};
        if (item.reading_num !== undefined) {
            metrics.view_count = item.reading_num;
        }
        if (item.share_num !== undefined) {
            metrics.share_count = item.share_num;
        }
        if (item.comment_num !== undefined) {
            metrics.comment_count = item.comment_num;
        }

        tmp.ctime = formattedCtime;
        tmp.modified_time = formattedModifiedTime;
        tmp.metrics = metrics;
        return {
            id: `${item.id}`,
            title: item.title || item.content,
            link: `${rootUrl}/detail/${item.id}`,
            description: tmp, // 注意：这里传入了原始对象，可能不是好主意
            pubDate: formattedCtime, // RSS 需要 Date 对象，不是格式化字符串
            category: item.subjects?.map((s) => s.subject_name) || [],
        };
    });

    return {
        title: `财联社 - 电报${category === '' ? '' : ` - ${categories[category]}`}`,
        link: currentUrl,
        item: items,
    };
}
