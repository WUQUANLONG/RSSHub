import { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';
import ofetch from '@/utils/ofetch';

export const route: Route = {
    path: '/tieba/hottopic',
    categories: ['bbs', 'social-media', 'popular'],
    example: '/baidu/tieba/hottopic',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['tieba.baidu.com/hottopic/browse/topicList'],
            target: '/baidu/hottopic',
        },
    ],
    name: '贴吧热议话题',
    maintainers: ['your-name'],
    handler,
    description: '获取百度贴吧热议话题榜',
};

async function handler() {
    const apiUrl = 'https://tieba.baidu.com/hottopic/browse/topicList';

    try {
        console.log('请求百度贴吧热议话题API...');

        const response = await ofetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            },
        });

        if (response.errno !== 0 || !response.data?.bang_topic?.topic_list) {
            throw new Error(response.errmsg || 'API返回数据格式异常');
        }

        const hotTopics = response.data.bang_topic.topic_list;
        console.log(`获取到 ${hotTopics.length} 条热议话题`);

        const items = hotTopics.map((item) => ({
            title: `${item.idx_num || '?'}. ${item.topic_name}`,
            link: item.topic_url?.replace(/&amp;/g, '&') ||
                `https://tieba.baidu.com/hottopic/browse/hottopic?topic_id=${item.topic_id}`,
            description: JSON.stringify(item, null, 2),
            pubDate: parseDate(item.create_time * 1000),
            guid: `tieba-topic-${item.topic_id}`,
        }));

        return {
            title: '百度贴吧热议话题榜',
            link: apiUrl,
            item: items,
            description: '百度贴吧实时热议话题榜',
            language: 'zh-cn',
        };

    } catch (error) {
        console.error('获取贴吧热议话题失败:', error);

        return {
            title: '百度贴吧热议话题榜',
            link: apiUrl,
            item: [{
                title: '获取热议话题失败',
                link: apiUrl,
                description: JSON.stringify({
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, null, 2),
                pubDate: parseDate(new Date()),
            }],
            description: '获取百度贴吧热议话题数据时发生错误',
            language: 'zh-cn',
            allowEmpty: true,
        };
    }
}
