import { Route } from '@/types';
import utils from './utils';
import got from '@/utils/got';
import {load} from "cheerio";
import cache from "@/utils/cache";
import {rootUrl} from "@/routes/cls/utils";
import {parseDate} from "@/utils/parse-date";
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
import ofetch from "@/utils/ofetch";
import {getRandomHeaders} from "@/utils/random-ua";

export const route: Route = {
    path: '/search',
    radar: [
        {
            source: ['thepaper.cn/'],
            target: '/',
        },
    ],
    name: '澎湃新闻搜索',
    categories: ['new-media'],
    example: '/thepaper/search',
    parameters: {
        k: {
            description: '关键字',
            type: 'string',
            required: true,
        }
    },
    maintainers: ['wuquanlong'],
    handler,
    url: 'thepaper.cn/',
};

async function handler(ctx) {

    const url = `https://api.thepaper.cn/search/web/news`;

    const k = ctx.req.query('k');
    if (!k || k.trim().length === 0) {
        throw new Error('搜索关键词不能为空');
    }
    const keyword = k.trim();

    try {
        let body = {
            word:keyword,
            orderType:3,
            pageNum:1,
            pageSize:10,
            searchType:1
        };

        const resoponse = await got.post(url, {
            json: body,
        });
        // console.log('sssss', resoponse);

        const res = resoponse.data;

        // 添加调试日志，查看返回的数据结构
        //console.log('API Response data:', JSON.stringify(sidebar_url_data, null, 2));

        // 检查数据结构是否正确
        if (!res || !res.data) {
            throw new Error(`Invalid data structure not found`);
        }

        const list = res.data.list;

        // 检查列表是否为空
        if (!Array.isArray(list) || list.length === 0) {
            throw new Error(`No data found `);
        }

        let items = list.map((item) => ({
            id: item.contId,
            title: item.name,
            link: `https://www.thepaper.cn/newsDetail_forward_${item.contId}`,
            pubDate: item.pubTimeLong ? parseDate(item.pubTimeLong) : parseDate(Date.now()),
        }));


        const ua = getRandomHeaders();
        const referer = 'https://www.thepaper.cn/';
        const processedItems = (await Promise.all(
            items.map(async (item) => {
                return await cache.tryGet(item.link, async () => {
                    try {
                        const detailResponse = await got({
                            method: 'get',
                            url: item.link,
                            headers: {
                                ...ua,
                                'Referer': referer,
                            },
                        });

                        const content = load(detailResponse.data);
                        const nextDataScript = content('script#__NEXT_DATA__');

                        if (!nextDataScript.length) {
                            console.warn('文章没有 __NEXT_DATA__ 脚本:', item.link);
                            return null; // 改为返回 null
                        }

                        let nextData;
                        try {
                            nextData = JSON.parse(nextDataScript.text());
                        } catch (error) {
                            console.warn('解析 __NEXT_DATA__ 失败:', item.link, error.message);
                            return null; // 改为返回 null
                        }

                        if (!nextData?.props?.pageProps?.detailData) {
                            console.warn('文章数据结构不完整:', item.link);
                            return null; // 改为返回 null
                        }

                        const contType = nextData.props.pageProps.detailData.contType;
                        let articleDetail = {};

                        if (contType === 8) {
                            articleDetail = nextData.props.pageProps.detailData.liveDetail || {};
                        } else {
                            articleDetail = nextData.props.pageProps.detailData.contentDetail || {};
                        }

                        // 处理内容
                        const rawContent = articleDetail?.content || articleDetail?.summary;
                        if (rawContent) {
                            try {
                                articleDetail.content = decodeAndExtractText(rawContent);
                                articleDetail.content_images = extractImageUrlsWithCheerio(rawContent);
                            } catch (error) {
                                console.warn('解码内容失败:', item.link, error.message);
                                articleDetail.content = item.title;
                                articleDetail.content_images = [];
                            }
                        } else {
                            articleDetail.content = item.title;
                            articleDetail.content_images = [];
                        }

                        let metrics = {}
                        // 通过接口，获取 点赞数，和 帖子的评论数
                        const likeCountRes = await got({
                            method: 'get',
                            url: `https://api.thepaper.cn/contentapi/article/detail/interaction/state?contId=${item.id}&contentType=1`,
                            headers: {
                                ...ua,
                                'Referer': referer,
                            },
                        });

                        if (likeCountRes?.data?.data?.praiseTimes) {
                            metrics.like_count = Number(likeCountRes.data.data.praiseTimes);
                        }

                        const commentCountRes = await got({
                            method: 'post',
                            url: `https://api.thepaper.cn/comment/news/comment/count`,
                            headers: {
                                ...ua,
                                'Referer': referer,
                            },
                            json: { contId: item.id } // 改为使用 json 选项
                        });

                        if (commentCountRes?.data?.data?.commentNum) {
                            metrics.comment_count = Number(commentCountRes.data.data.commentNum);
                        }

                        articleDetail.metrics = metrics;
                        item.description = articleDetail;
                        item.author = articleDetail?.author?.name ?? item.author ?? '';

                        return item;

                    } catch (error) {
                        console.error('处理文章时发生错误:', item.link, error.message);
                        return null;
                    }
                }, 5);
            })
        )).filter(Boolean); // 这里过滤 null

        // 再次检查 items 是否为空
        if (processedItems.length === 0) {
            throw new Error('No valid items found after processing');
        }

        return {
            title: `澎湃新闻 - 搜索 - ${keyword}`,
            link: 'https://www.thepaper.cn',
            item: processedItems,
            description: `澎湃新闻 - 搜索 - ${keyword}`,
            allowEmpty: true,
        };

    } catch (error) {
        console.error('Error fetching sidebar data:', error);

        // 返回一个错误消息，而不是空数组
        return {
            title: `澎湃新闻 - 搜索 - ${keyword}`,
            link: 'https://www.thepaper.cn',
            item: [],
            allowEmpty: true,
        };
    }
}
