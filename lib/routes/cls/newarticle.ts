import { Route } from '@/types';

import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import {formatDate, parseDate} from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';

import { rootUrl, getSearchParams } from './utils';

export const handler = async (ctx) => {
    const timestampSeconds = Date.now() / 1000 | 0;
    const last_article_timestamp = ctx.req.query('last_article_timestamp') ? Number.parseInt(ctx.req.query('last_article_timestamp'), timestampSeconds) : timestampSeconds;

    // 请求文章接口，https://www.cls.cn/api/subject/attention/channel/articles/web?app=CailianpressWeb&last_article_time=1765935596&os=web&rn=20&sv=8.4.6&type=2&sign=5b0bd084c16d8d12c07d49d8b453891f
    // 需要注意，一定要有 last_article_time 秒级时间戳

    const apiUrl = new URL(`api/subject/attention/channel/articles/web`, rootUrl).href;

    const { data: response } = await got(apiUrl, {
        searchParams: getSearchParams({
            app: 'CailianpressWeb',
            last_article_time: last_article_timestamp,
            os: 'web',
            rn: 20,
            sv: '8.4.6',
            type: 2,
        }),
    });
    const items = response.data.map((item) => {
        const regex = /【(.*?)】/;
        let title = item.article_title ? item.article_title : '';
        let content = item.article_brief ? item.article_brief : item.article_title;
        let pubDate = item.article_time ? formatDate(parseDate(item.article_time * 1000)) : formatDate(parseDate(Date.now));

        const result = regex.exec(title);
        if (result) {
            title = result[1];
        }

        item.article_time = pubDate;
        if (item.read_num) {
            item.view_count = item.read_num;
        }
        if (item.comments_num) {
            item.comment_count = item.comments_num;
        }
        if (item.collection_num) {
            item.collect_count = item.collection_num;
        }
        if (item.share_num) {
            item.share_count = item.share_num;
        }

        return {
            title: title,
            description: item,
            pubDate: pubDate,
            link: new URL(`detail/${item.article_id}`, rootUrl).href,
            category: item.subjects.map((s) => s.subject_name),
            author: item.article_author,
            guid: `cls-article-${item.article_id}`,
            id: `cls-article-${item.article_id}`,
        };
    });


    return {
        title: `话题广场-最新发布文章`,
        description: `话题广场-最新发布文章`,
        link: 'https://www.cls.cn/subject',
        item: items,
    };
};

export const route: Route = {
    path: '/article/newest',
    name: '最新文章',
    url: 'www.cls.cn',
    maintainers: ['wuquanlong'],
    handler,
    example: '/article/newest',
    parameters: {
        last_article_timestamp: {
            description: '最新文章的时间戳',
            type: 'number',
            required: false,
        },},
    description: `话题广场，更新的文章，按照时间倒序排列`,
    categories: ['finance'],

    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportRadar: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    }
};

// // 一个元素的数据
// "subject_id": 1097,
// "subject_name": "港股动态",
// "subject_img": "https://img.cls.cn/images/20210121/3CGMMVga78.jpg",
// "eoe_tag": "",
// "article_id": 2231746,
// "article_title": "【港股航空股延续涨势 中国东方航空股份涨近4%】财联社12月17日电，截至发稿，中国东方航空股份(00670.HK)涨3.97%、中国南方航空股份(01055.HK)涨3.09%、中国国航(00753.HK)涨2.78%。",
// "article_brief": "",
// "article_guide_text": "",
// "article_author": "",
// "article_img": "",
// "article_time": 1765935378,
// "article_type": -1,
// "article_recommend": 0,
// "is_push": false,
// "is_collection": false,
// "stock_list": [],
// "plate_list": [],
// "comments_num": 0,
// "collection_num": 0,
// "read_num": 34319,
// "externalLink": "",
// "share_url": "https://api3.cls.cn/share/article/2231746?os=web\u0026sv=8.4.6\u0026app=CailianpressWeb",
// "share_img": "https://img.cls.cn/share/roll.png",
// "schema": "cailianshe://telegram_detail?detail_id=2231746",
// "share_num": 2,
// "is_reporter_subject": false,
// "subjects": [
//     {
//         "article_id": 2231746,
//         "subject_id": 1097,
//         "subject_name": "港股动态",
//         "subject_img": "",
//         "subject_description": "",
//         "category_id": 0,
//         "attention_num": 26078,
//         "is_attention": false,
//         "is_reporter_subject": false,
//         "plate_id": 0,
//         "channel": "stib,cls"
//     }
// ],
// "share_content": "",
// "is_attention": 0,
// "gray_share": 0
