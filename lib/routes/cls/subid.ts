import { Route } from '@/types';

import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import {formatDate, parseDate} from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';

import { rootUrl, getSearchParams } from './utils';
import {decodeAndExtractText} from "@/utils/parse-html-content";

export const handler = async (ctx) => {
    // 第一步，先请求 https://www.cls.cn/api/subject/category?app=CailianpressWeb&os=web&sv=8.4.6&sign=9f8797a1f4de66c2370f7a03990d2737
    // 拿到，所有的 category id，

    // 第二步，依次遍历所有的 category id 去拿到所有的话题 id，
    // https://www.cls.cn/api/subject/1007/subject?app=CailianpressWeb&id=1007&os=web&sv=8.4.6&sign=fad5720d8c54ef2e9e11f73f40662ee3
    //  1007 为 category id，

    const apiUrl = new URL(`api/subject/category`, rootUrl).href;
    console.log('ssss', apiUrl);
    const { data: response } = await got(apiUrl, {
        searchParams: getSearchParams({
            app: 'CailianpressWeb',
            os: 'web',
            sv: '8.4.6',
        }),
    });
    let items = response.data;
    let subIds = [];

    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(`cls_category_${item.id}`, async () => {

                const apiUrl2 = new URL(`api/subject/${item.id}/subject`, rootUrl).href;

                const { data: response } = await got(apiUrl2, {
                    searchParams: getSearchParams({
                        app: 'CailianpressWeb',
                        id: item.id,
                        os: 'web',
                        sv: '8.4.6',
                    }),
                });

                let subID_tmp = response.data.map((t) => {
                    t.create_time = parseDate(t.create_time * 1000);

                    let t2 = t;
                    t2.create_time = formatDate(t.create_time);
                    return {id: t.id, description : t2, pubDate: t.create_time};
                });
                subIds.push(...subID_tmp);
                return subID_tmp;
            })
        )
    );
    subIds = Array.from(
        new Map(subIds.map(item => [item.id, item])).values()
    );


    return {
        title: `财联社 话题 id列表`,
        description: '财联社 话题 id列表',
        link: '',
        item: subIds,
        allowEmpty: true,
    };
};

export const route: Route = {
    path: '/subid',
    name: '话题列表',
    url: 'www.cls.cn',
    maintainers: ['nczitzk'],
    handler,
    example: '/cls/subid',
    parameters: { },
    description: `尽可能的拿到所有的话题列表`,
    categories: ['finance'],

    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportRadar: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
    ],
};
