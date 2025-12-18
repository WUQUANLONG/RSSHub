import { Route } from '@/types';
import utils from './utils';
import got from '@/utils/got';
import {load} from "cheerio";
import cache from "@/utils/cache";
import {rootUrl} from "@/routes/cls/utils";
import {parseDate} from "@/utils/parse-date";
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
import ofetch from "@/utils/ofetch";


const sections = {
    hotNews: '澎湃热榜',
    financialInformationNews: '澎湃财讯',
    morningEveningNews: '早晚报',
};

export const route: Route = {
    path: '/newest',
    radar: [
        {
            source: ['thepaper.cn/'],
            target: '/',
        },
    ],
    name: '首页-要闻-时间倒序',
    categories: ['new-media'],
    example: '/thepaper/newest',
    parameters: {
        page: {
            description: '页码',
            type: 'number',
            required: false,
        },
        start: {
            description: '毫秒时间戳',
            type: 'number',
            required: false,
        },
    },
    maintainers: ['wuquanlong'],
    handler,
    url: 'thepaper.cn/',
};

async function handler(ctx) {


    const url = `https://api.thepaper.cn/contentapi/nodeCont/getByChannelId`;

    let page = ctx.req.query('page') ? ctx.req.query('page') : 0;
    let start = ctx.req.query('start') ? ctx.req.query('start') : 0;

    try {
        let body = {
            "channelId":"",
            "excludeContIds":[32193674,32193902,32193484,32189475,32193701,32193764,32193499,32193498,32193496,32193503,32193501,32187196,32187921,32178806,32193717],
            "listRecommendIds":[32193717,32193701,32193764,32193674],
            "pageSize":20,
            "startTime":""
        };
        if (page && start && (page > 1)) {
            body.startTime = start;
            body.page = page;
        }

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

        const hasNext = res.data.hasNext;
        const nextTimestamp = res.data.startTime;
        const list = res.data.list;

        // 检查列表是否为空
        if (!Array.isArray(list) || list.length === 0) {
            throw new Error(`No data found `);
        }

        let items = list.map((item) => ({
            title: item.title || item.name,
            link: `https://www.thepaper.cn/newsDetail_forward_${item.contId}`,
            pubDate: item.pubTimeLong ? parseDate(item.pubTimeLong) : parseDate(Date.now()),
        }));

        const processedItems = [];
        for (const item of items) {
            try{
                const processedItem = await cache.tryGet(item.link, async () => {
                    try {
                        const detailResponse = await got({
                            method: 'get',
                            url: item.link,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': 'https://www.thepaper.cn/',
                                'Accept': 'application/json, text/plain, */*',
                            }
                        });

                        const content = load(detailResponse.data);
                        const nextDataScript = content('script#__NEXT_DATA__');

                        if (!nextDataScript.length) {
                            console.warn('文章没有 __NEXT_DATA__ 脚本:', item.link);
                            return {
                                ...item,
                                description: item.title,
                                author: item.author || '',
                            };
                        }

                        let nextData;
                        try {
                            nextData = JSON.parse(nextDataScript.text());
                        } catch (error) {
                            console.warn('解析 __NEXT_DATA__ 失败:', item.link, error.message);
                            return {
                                ...item,
                                description: item.title,
                                author: item.author || '',
                            };
                        }

                        if (!nextData?.props?.pageProps?.detailData) {
                            console.warn('文章数据结构不完整:', item.link);
                            return {
                                ...item,
                                description: item.title,
                                author: item.author || '',
                            };
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

                        item.description = articleDetail;
                        item.author = articleDetail?.author?.name ?? item.author ?? '';

                        return item;

                    } catch (error) {
                        console.error('处理文章时发生错误:', item.link, error.message);

                        // 返回降级数据，确保有返回值
                        return {
                            ...item,
                            description: `获取文章内容失败: ${error.message}`,
                            author: item.author || '',
                        };
                    }
                });
                processedItems.push(processedItem);
                // 可选：添加一个小的延迟，避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`处理项目失败: ${item.link}`, error);
                // 即使失败也保留一个基础项
                processedItems.push({
                    ...item,
                    description: '处理过程发生错误',
                    author: item.author || '',
                });
            }
        }

        items = processedItems;
        // 再次检查 items 是否为空
        if (items.length === 0) {
            throw new Error('No valid items found after processing');
        }

        return {
            title: `澎湃新闻 - 要闻 - 最新`,
            link: 'https://www.thepaper.cn',
            item: items,
            description: `澎湃新闻  要闻更新`,
        };

    } catch (error) {
        console.error('sonmething error:', error);

        // 返回一个错误消息，而不是空数组
        return {
            title: `澎湃新闻 - 要闻 - 最新`,
            link: 'https://www.thepaper.cn',
            item: [],
        };
    }
}


// hotNews 数据 一个元素示例
// {
//     "contId":"32126241",
//     "isOutForword":"0",
//     "isOutForward":"0",
//     "forwardType":"0",
//     "mobForwardType":2,
//     "interactionNum":"75",
//     "praiseTimes":"521",
//     "pic":"https://imgpai.thepaper.cn/newpai/image/1765108154840_zJ815T_1765108155090.png",
//     "imgCardMode":0,
//     "smallPic":"https://imgpai.thepaper.cn/newpai/image/1765108154840_zJ815T_1765108155090.png?x-oss-process=image/resize,w_332",
//     "sharePic":"https://imgpai.thepaper.cn/newpai/image/1765108167642_2kdQfd_1765108167933.png",
//     "pubTime":"20小时前",
//     "pubTimeNew":"20小时前",
//     "name":"言短意长｜起底“全网最忙五人组”彰显建设性舆论监督力量",
//     "closePraise":"0",
//     "nodeInfo":{
//         "nodeId":25462,
//         "name":"中国政库",
//         "desc":"洞悉中国动向的时政解读",
//         "pic":"https://imagecloud.thepaper.cn/thepaper/image/4/158/61.png",
//         "nodeType":0,
//         "channelType":0,
//         "forwordType":22,
//         "forwardType":"22",
//         "liveType":"2",
//         "parentId":25388,
//         "isOrder":"0",
//         "dataType":"0",
//         "shareName":"中国政库",
//         "nickName":"",
//         "mobForwardType":"22",
//         "summarize":"例行会议上，公报文件中，党报纸页间，民间倡议里，为你描摹国家政治走向，指点公共政策内涵，记录改革艰难进程。到位而不越位，是政库也是智库",
//         "color":"",
//         "videoLivingRoomDes":"",
//         "wwwSpecNodeAlign":0,
//         "govAffairsType":"",
//         "showSpecialBanner":false,
//         "showSpecialTopDesc":false,
//         "topBarTypeCustomColor":false,
//         "showVideoBottomRightBtn":false
//     },
//     "nodeId":25462,
//     "contType":0,
//     "pubTimeLong":1765110426207,
//     "specialNodeId":0,
//     "cardMode":"101",
//     "dataObjId":52,
//     "closeFrontComment":false,
//     "isSupInteraction":false,
//     "tagList":[
//         {
//             "tagId": 6653097,
//             "tag": "言短意长",
//             "isOrder": "0",
//             "isUpdateNotify": "0",
//             "isWonderfulComments": "0"
//         }
//     ],
//     "hideVideoFlag":false,
//     "praiseStyle":1,
//     "isSustainedFly":0,
//     "softLocType":1,
//     "closeComment":false,
//     "voiceInfo":{
//         "voiceSrc":"https://audios.thepaper.cn/input/32126241_202512080014b28bfdce-a8d8-419c-85f3-9b1ea9c5f566.mp3",
//         "imgSrc":"https://imgpai.thepaper.cn/newpai/image/1765108167642_2kdQfd_1765108167933.png",
//         "isHaveVoice":"1"
//     },
//     "softAdTypeStr":"1,1,1",
//     "originalContId":32126241,
//     "paywalled":false,
//     "audiovisualBlogSwitch":false,
//     "audiovisualBlogGuests":"",
//     "seriesTagRecType":"其他"
// }
