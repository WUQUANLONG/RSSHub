import { Route } from '@/types';
import utils from './utils';
import got from '@/utils/got';

const sections = {
    hotNews: '澎湃热榜',
    financialInformationNews: '澎湃财讯',
    morningEveningNews: '早晚报',
};

export const route: Route = {
    path: '/sidebar/:sec?',
    radar: [
        {
            source: ['thepaper.cn/'],
            target: '/sidebar',
        },
    ],
    name: '侧边栏',
    categories: ['new-media'],
    example: '/thepaper/sidebar',
    parameters: { sec: '侧边栏 id，可选 `hotNews` 即 澎湃热榜、`financialInformationNews` 即 澎湃财讯、`morningEveningNews` 即 早晚报，默认为 `hotNews`' },
    maintainers: ['bigfei'],
    handler,
    url: 'thepaper.cn/',
};

async function handler(ctx) {
    const { sec = 'hotNews' } = ctx.req.param();

    const sidebar_url = `https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar`;

    try {
        const sidebar_url_resp = await got(sidebar_url, {
            // 添加一些 headers 模拟浏览器请求
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.thepaper.cn/',
                'Accept': 'application/json, text/plain, */*',
            }
        });

        const sidebar_url_data = sidebar_url_resp.data;

        // 添加调试日志，查看返回的数据结构
        //console.log('API Response data:', JSON.stringify(sidebar_url_data, null, 2));

        // 检查数据结构是否正确
        if (!sidebar_url_data || !sidebar_url_data.data || !sidebar_url_data.data[sec]) {
            throw new Error(`Invalid data structure or section '${sec}' not found`);
        }

        const list = sidebar_url_data.data[sec];

        // 检查列表是否为空
        if (!Array.isArray(list) || list.length === 0) {
            throw new Error(`No data found for section '${sec}'`);
        }

        const items = list.map(item => {
            // 确保必要字段存在
            if (!item.contId || !item.name) {
                console.warn('Invalid item found:', item);
                return null;
            }

            return {
                id: item.contId,
                link: `https://www.thepaper.cn/newsDetail_forward_${item.contId}`,
                title: item.name,
                pubDate: item.pubTimeLong ? new Date(item.pubTimeLong).toISOString() : new Date().toISOString(),
                description: item.name,
                // 可以添加更多字段
                author: item.nodeInfo?.name || '澎湃新闻',
                category: item.nodeInfo?.name || '新闻',
            };
        }).filter(Boolean); // 过滤掉 null 的项

        // 再次检查 items 是否为空
        if (items.length === 0) {
            throw new Error('No valid items found after processing');
        }

        return {
            title: `澎湃新闻 - ${sections[sec]}`,
            link: 'https://www.thepaper.cn',
            item: items,
            description: `澎湃新闻 ${sections[sec]} 更新`,
        };

    } catch (error) {
        console.error('Error fetching sidebar data:', error);

        // 返回一个错误消息，而不是空数组
        return {
            title: `澎湃新闻 - ${sections[sec]}`,
            link: 'https://www.thepaper.cn',
            item: [{
                title: '获取数据失败',
                description: `获取 ${sections[sec]} 数据时出错: ${error.message}`,
                pubDate: new Date().toISOString(),
                link: 'https://www.thepaper.cn',
            }],
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
