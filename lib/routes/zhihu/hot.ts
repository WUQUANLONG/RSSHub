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

        if (targetWithDetail.answer_count !== undefined && targetWithDetail.answer_count !== null) {
            targetWithDetail.like_count = Number(targetWithDetail.answer_count);
        }
        if (targetWithDetail.follower_count !== undefined && targetWithDetail.follower_count !== null) {
            targetWithDetail.collect_count = Number(targetWithDetail.follower_count);
        }
        if (targetWithDetail.comment_count !== undefined && targetWithDetail.comment_count !== null) {
            targetWithDetail.comment_count = Number(targetWithDetail.comment_count);
        }
        // 热度 当做 查看数
        if (targetWithDetail.detail_text !== undefined && targetWithDetail.detail_text !== null) {
            targetWithDetail.view_count = parseHeatValue(targetWithDetail.detail_text);
        }
        // 添加分享数（如果存在）

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
function parseHeatValue(heatText) {
    if (!heatText) return 0;

    // 匹配 "数字 + 可选空格 + 单位 + 热度"
    const match = heatText.match(/(\d+(?:\.\d+)?)\s*([万千百十亿])?/);
    if (!match) return 0;

    const num = parseFloat(match[1]);
    const unit = match[2];

    // 单位乘数
    const multipliers = {
        '十': 10,
        '百': 100,
        '千': 1000,
        '万': 10000,
        '亿': 100000000
    };
    const multiplier = unit ? multipliers[unit] || 1 : 1;
    const result = Math.round(num * multiplier);

    //console.log(`转换: "${heatText}" -> ${num} * ${multiplier} = ${result}`);
    return result;
}
// target数据样例
// target数据 {
//     id: 546132320,
//     title: '既然人的体温为 37℃，那为什么在 35℃ 的气温下，人们觉得很热而不是凉快？',
//     url: 'https://api.zhihu.com/questions/546132320',
//     type: 'question',
//     created: 1659174569,
//     answer_count: 323,
//     follower_count: 1392,
//     author: {
//         type: 'people',
//         user_type: 'people',
//         id: '0',
//         url_token: '',
//         url: '',
//         name: '用户',
//         headline: '',
//         avatar_url: 'https://pica.zhimg.com/aadd7b895_s.jpg'
//     },
//     bound_topic_ids: [ 8437, 19591, 89475, 332041 ],
//     comment_count: 0,
//     is_following: false,
//     excerpt: '[图片]'
// }
