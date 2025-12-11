import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: 'hotnews',
    categories: ['new-media'],
    example: '/qq/hotnews',
    parameters: {},
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

async function handler() {
    const url = 'https://i.news.qq.com/gw/event/pc_hot_ranking_list?ids_hash=&offset=0&page_size=51&appver=15.5_qqnews_7.1.60&rank_id=hot';

    const response = await ofetch(url);
    const data = response;

    if (data.ret !== 0 || !data.idlist?.[0]?.newslist) {
        throw new Error('Invalid response data');
    }

    const newslist = data.idlist[0].newslist
        .filter((item) => item.id && item.id !== 'TIP2022042216544300') // 过滤第一条测试数据
        .map((item) => {
            const link = item.surl || item.url || `https://view.inews.qq.com/a/${item.id}`;
            // const descriptionData = {
            //     abstract: item.abstract || item.nlpAbstract || '',
            //     source: item.source || item.chlname || '',
            //     readCount: item.readCount || 0,
            //     comments: item.comments || item.commentNum || 0,
            //     likeInfo: item.likeInfo || 0,
            //     shareCount: item.shareCount || 0,
            //     ranking: item.ranking || 0,
            //     hotScore: item.hotEvent?.hotScore || 0,
            //     thumbnails: item.thumbnails?.[0] || item.thumbnails_qqnews?.[0] || '',
            //     userAddress: item.userAddress || '',
            //     time: item.time || '',
            // };

            return {
                title: item.title || item.longtitle || '无标题',
                link,
                description: item,
                pubDate: parseDate(item.time || item.timestamp * 1000),
                author: item.source || item.chlname || '腾讯新闻',
                category: [item.chlname, item.tag].filter(Boolean),
                guid: item.id,
            };
        });

    return {
        title: '腾讯新闻热点榜',
        link: 'https://news.qq.com/hot',
        description: '腾讯新闻热点榜，每10分钟更新一次',
        item: newslist,
    };
}
