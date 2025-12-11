import { Route, ViewType } from '@/types';
import got from '@/utils/got';
import { config } from '@/config';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/hot/:category?',
    categories: ['social-media'],
    example: '/zhihu/hot',
    view: ViewType.Articles,
    features: {
        requireConfig: [
            {
                name: 'ZHIHU_COOKIES',
                description: '',
                optional: true,
            },
        ],
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '知乎热榜',
    maintainers: ['nczitzk', 'pseudoyu', 'DIYgod'],
    handler,
};

async function handler(ctx) {
    const category = ctx.req.param('category');
    if (category) {
        ctx.set('redirect', `/zhihu/hot`);
        return null;
    }

    const cookie = config.zhihu.cookies;

    const response = await got({
        method: 'get',
        url: `https://api.zhihu.com/topstory/hot-lists/total?limit=50&reverse_order=0`,
        headers: {
            Cookie: cookie,
        },
    });

    const items = response.data.data.map((item) => {
        const questionId = item.target.url ? item.target.url.split('/').pop() : String(item.target.id);

        const targetWithDetail = { ...item.target };

        targetWithDetail.detail_text = item.detail_text || '';

        return {
            link: `https://www.zhihu.com/question/${questionId}`,
            title: item.target.title,
            pubDate: parseDate(item.target.created * 1000),
            description: targetWithDetail,
        };
    });

    return {
        title: `知乎热榜`,
        link: `https://www.zhihu.com/hot`,
        item: items,
    };
}

// target数据样例
// target数据 {
//     id: 546132320,
//         title: '既然人的体温为 37℃，那为什么在 35℃ 的气温下，人们觉得很热而不是凉快？',
//         url: 'https://api.zhihu.com/questions/546132320',
//         type: 'question',
//         created: 1659174569,
//         answer_count: 323,
//         follower_count: 1392,
//         author: {
//         type: 'people',
//             user_type: 'people',
//             id: '0',
//             url_token: '',
//             url: '',
//             name: '用户',
//             headline: '',
//             avatar_url: 'https://pica.zhimg.com/aadd7b895_s.jpg'
//     },
//     bound_topic_ids: [ 8437, 19591, 89475, 332041 ],
//         comment_count: 0,
//         is_following: false,
//         excerpt: '[图片]'
// }
