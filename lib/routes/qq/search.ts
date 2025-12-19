import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: 'search',
    categories: ['new-media'],
    example: '/qq/search',
    parameters: {
        k: {
            description: '搜索关键词',
            type: 'string',
            required: true,
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
    name: '腾讯新闻热点榜',
    maintainers: ['wuquanlong'],
    handler,
    description: '腾讯新闻热点榜，每10分钟更新一次，包含实时热点新闻排行',
};

async function handler(ctx) {
    const { k } = ctx.req.query();

    if (!k || k.trim().length === 0) {
        throw new Error('搜索关键词不能为空');
    }

    const keyword = k.trim();


    const url = 'https://i.news.qq.com/gw/pc_search/result';

    const response = await ofetch(url,
        {
            method: 'POST',
            query: {
                page : 0,
                query: keyword,
                is_pc : 1,
                hippy_custom_version : 25,
                search_type : 'all',
                search_count_limit : 10,
                appver: '15.5_qqnews_7.1.80',
            }
        });
    const data = response;

    if (data.ret !== 0 || !data.secList) {
        throw new Error('Invalid response data');
    }

    const newslist = data.secList
        .map((item) => {
            if (item.newsList && Array.isArray(item.newsList) && item.newsList.length > 0) {
                let item_content = item.newsList[0];
                delete (item_content as any).timeLine; // 有时间线，数据量太大
                delete (item_content as any).newsModule;  // 一个新闻的格式
                delete (item_content as any).card; // 作者信息，有些重复
                delete (item_content as any).shareDoc // 分享信息
                delete (item_content as any).thumbnails
                return {
                    title: item_content.title || item_content.longtitle || '无标题',
                    url: item_content.url,
                    description: item_content,
                    pubDate: parseDate(item_content.time || item_content.timestamp * 1000),
                    author: item_content.source || item_content.chlname || '腾讯新闻',
                    guid: item_content.id,
                };
            }
            return null;
        }).filter(item => item !== null);

    return {
        title: '腾讯新闻-关键字搜索',
        link: 'https://news.qq.com/search',
        description: `腾讯新闻-关键字-${keyword}`,
        item: newslist,
    };
}
