import { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";

export const route: Route = {
    path: '/search',
    categories: ['finance'],
    example: '/wallstreetcn/search',
    parameters: {
        k: {
            description: '关键字',
            type: 'string',
            required: true,
        }
    },
    radar: [
        {
            source: ['wallstreetcn.com/news/:category', 'wallstreetcn.com/'],
        },
    ],
    name: '资讯',
    maintainers: ['nczitzk'],
    handler,
    description: `| id           | 分类 |
| ------------ | ---- |
| global       | 最新 |
| shares       | 股市 |
| bonds        | 债市 |
| commodities  | 商品 |
| forex        | 外汇 |
| enterprise   | 公司 |
| asset-manage | 资管 |
| tmt          | 科技 |
| estate       | 地产 |
| car          | 汽车 |
| medicine     | 医药 |`,
};

async function handler(ctx) {
    const k = ctx.req.query('k');
    if (!k || k.trim().length === 0) {
        throw new Error('搜索关键词不能为空');
    }
    const keyword = k.trim();


    const rootUrl = 'https://wallstreetcn.com';
    const apiRootUrl = 'https://api-one.wallstcn.com';
    const currentUrl = `${rootUrl}/search?q=${keyword}&type=info`;
    const apiUrl = `${apiRootUrl}/apiv1/search/article?query==${keyword}&cursor=&limit=20&vip_type=`;

    // 查询接口 https://api-one-wscn.awtmt.com/apiv1/search/article?query=keyword&cursor=&limit=20&vip_type=
    const response = await got({
        method: 'get',
        url: apiUrl,
    });

    let items = response.data.data.items
        .filter((item) => {
            return item.resource_type !== 'ad' &&
                item.resource_type !== 'theme';
        })
        .map((item) => ({
            type: 'article',
            guid: item.id,
            link: item.uri,
            pubDate: parseDate(item.display_time * 1000),
        }));

    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got({
                    method: 'get',
                    url: `${apiRootUrl}/apiv1/content/${item.type === 'live' ? `lives/${item.guid}` : `articles/${item.guid}?extract=0`}`,
                });

                const responseData = detailResponse.data;

                // 处理 { code: 60301, message: '内容不存在或已被删除', data: {} }
                if (responseData.code !== 20000) {
                    return null;
                }

                const data = responseData.data;

                item.title = data.title || data.content_text;
                item.author = data.source_name ?? data.author.display_name;

                let content = data.content + (data.content_more ?? '');
                data.content = decodeAndExtractText(content);
                data.content_images = extractImageUrlsWithCheerio(content);
                item.description = data;

                item.category = data.asset_tags?.map((t) => t.name) ?? [];

                if (data.audio_uri) {
                    item.enclosure_type = 'audio/mpeg';
                    item.enclosure_url = data.audio_uri;
                    item.itunes_item_image = data.image?.uri ?? '';
                    item.itunes_duration = data.audio_info?.duration ?? '';
                }

                delete item.type;

                return item;
            })
        )
    );

    items = items.filter((item) => item !== null);

    return {
        title: `华尔街见闻 - 搜索 - ${keyword}`,
        link: currentUrl,
        item: items,
        itunes_author: '华尔街见闻',
        image: 'https://static.wscn.net/wscn/_static/favicon.png',
    };
}
