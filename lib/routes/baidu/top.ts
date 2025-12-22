import { Route } from '@/types';

import got from '@/utils/got';
import { load } from 'cheerio';
import { art } from '@/utils/render';
import path from 'node:path';
import {parseDate} from "@/utils/parse-date";

export const route: Route = {
    path: '/top/:board?',
    categories: ['other'],
    example: '/baidu/top',
    parameters: { board: '榜单，默认为 `realtime`' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '热搜榜单',
    maintainers: ['xyqfer'],
    handler,
    description: `| 热搜榜   | 小说榜 | 电影榜 | 电视剧榜 | 汽车榜 | 游戏榜 |
| -------- | ------ | ------ | -------- | ------ | ------ |
| realtime | novel  | movie  | teleplay | car    | game   |`,
};

async function handler(ctx) {
    const { board = 'realtime' } = ctx.req.param();
    const link = `https://top.baidu.com/board?tab=${board}`;
    const { data: response } = await got(link);

    const $ = load(response);

    const { data } = JSON.parse(
        $('#sanRoot')
            .contents()
            .filter((e) => e.nodeType === 8)
            .prevObject[0].data.match(/s-data:(.*)/)[1]
    );

    // const items = data.cards[0].content.map((item) => ({
    //     title: item.word,
    //     description: item,
    //     link: item.rawUrl,
    // }));

    const items = data.cards[0].content.map((item) => {

        const targetWithDetail = { ...item };

        // 热度 当做 查看数
        if (targetWithDetail.desc !== undefined && targetWithDetail.desc !== null) {
            targetWithDetail.content = targetWithDetail.desc;
        }
        if (targetWithDetail.hotScore !== undefined && targetWithDetail.hotScore !== null) {
            targetWithDetail.view_count = Number(targetWithDetail.hotScore);
        }
        // 添加分享数（如果存在）

        return {
            title: item.word,
            description: targetWithDetail,
            link: item.rawUrl,
        };
    });

    return {
        title: `${data.curBoardName} - 百度热搜`,
        description: $('meta[name="description"]').attr('content'),
        link,
        item: items,
    };
}
