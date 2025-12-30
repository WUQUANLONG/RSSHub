import { Route } from '@/types';
import got from '@/utils/got';
import queryString from 'query-string';
import { parseDate } from '@/utils/parse-date';
import sanitizeHtml from 'sanitize-html';
//import { parseToken } from '@/routes/xueqiu/cookies';
import { generateRandomString, getWAFWithCurl} from './cookies2';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";

export const route: Route = {
    path: '/hots',
    categories: ['finance'],
    example: '/xueqiu/hots',
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
            source: ['xueqiu.com/'],
        },
    ],
    name: '热帖',
    maintainers: ['wuquanlong'],
    handler,
    url: 'xueqiu.com/',
};

async function handler() {
    const { wafToken: wafToken, cookies} = await getWAFWithCurl();
    const cookiesStr = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    const res2 = await got({
        method: 'get',
        url: 'https://xueqiu.com/statuses/hots.json',
        searchParams: queryString.stringify({
            a: '1',
            count: '10',
            page: '1',
            scope: 'day',
            type: 'status',
            meigu: '0',
        }),
        headers: {
            Cookie: cookiesStr,
            Referer: 'https://xueqiu.com/',
        },
    });
    const data = res2.data;

    return {
        title: '热帖 - 雪球',
        link: 'https://xueqiu.com/',
        description: '雪球热门帖子',
        item: data.map((item) => {
            const description = item.text;
            let content = {};
            content.content = decodeAndExtractText(description);
            content.content_images = extractImageUrlsWithCheerio(description);
            return {
                title: item.title ?? sanitizeHtml(description, { allowedTags: [], allowedAttributes: {} }),
                content,
                pubDate: parseDate(item.created_at),
                link: `https://xueqiu.com${item.target}`,
                author: item.user.screen_name,
            };
        }),
    };
}
