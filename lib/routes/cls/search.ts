import { Route } from '@/types';

import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';

import { rootUrl, getSearchParams } from './utils';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";

export const handler = async (ctx) => {
    const k = ctx.req.query('k');
    if (!k || k.trim().length === 0) {
        throw new Error('搜索关键词不能为空');
    }
    const keyword = k.trim();

    const apiUrl = new URL(`api/sw`, rootUrl).href;

    const {data: response} = await got(apiUrl, {
        searchParams: getSearchParams({
            os: "web",
            sv: "8.4.6",
            app: "CailianpressWeb",
            type: 'all',
            keyword: keyword,
        }),
        method: 'post',
        body: {"type": "all", "keyword": keyword},
    });

    // 查询出来的数据，主要有两类是有价值的，telegram 和 depth
    let items = [];
    if (response?.data?.telegram?.data) {
        for (const t of response.data.telegram.data) {
            items.push({
                id: t.id,
                link: new URL(`detail/${t.id}`, rootUrl).href,
            });
        }
    }
    if (response?.data?.depth?.data) {
        for (const t of response.data.depth.data) {
            items.push({
                id: t.id,
                link: new URL(`detail/${t.id}`, rootUrl).href,
            });
        }
    }
    // console.log('调试', items);

    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link, async () => {
                const { data: detailResponse } = await got(item.link);

                const $$ = load(detailResponse);

                const data = JSON.parse($$('script#__NEXT_DATA__').text())?.props?.initialState?.detail?.articleDetail ?? undefined;

                if (!data) {
                    return item;
                }

                const title = data.title;
                let contnet = {}
                contnet.content = decodeAndExtractText(data.content);
                contnet.content_images = extractImageUrlsWithCheerio(data.content);

                let metrics = {};
                if (data.readingNum !== undefined) {
                    metrics.view_count = data.readingNum;
                }
                if (data.commentNum !== undefined) {
                    metrics.comment_count = data.commentNum;
                }
                contnet.metrics = metrics;

                const guid = `${data.id}`;
                const image = data.images?.[0] ?? undefined;

                item.title = title;
                item.description = contnet;
                item.pubDate = parseDate(data.ctime, 'X');
                item.category = [...new Set(data.subject?.flatMap((s) => [s.name, ...(s.subjectCategory?.flatMap((c) => [c.columnName || [], c.name || []]) ?? [])]))].filter(Boolean);
                item.author = data.author?.name ?? item.author;
                item.guid = guid;
                item.id = guid;
                item.image = image;
                item.banner = image;

                return item;
            }, 5)
        )
    );

    return {
        title: `财联社-搜索-${keyword}`,
        description: `财联社-搜索`,
        link: `https://www.cls.cn/searchPage?type=all&keyword=${keyword}`,
        item: items,
        allowEmpty: true,
    };
};

export const route: Route = {
    path: '/search',
    name: '关键字搜索',
    url: 'www.cls.cn',
    maintainers: ['wuquanlong'],
    handler,
    example: '/cls/search',
    parameters: { k: '查询关键字' },
    description: `关键字搜索`,
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
        {
            source: ['www.cls.cn/searchPage'],
        },
    ],
};
