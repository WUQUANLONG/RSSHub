import { Route } from '@/types';
import api from './api';
import utils from './utils';
import { fallback, queryToBoolean } from '@/utils/readable-social';
import { config } from '@/config';
import logger from "@/utils/logger";

export const route: Route = {
    path: '/tweet/:id/status/:status/:original?',
    categories: ['social-media'],
    example: '/twitter/tweet/DIYgod/status/1650844643997646852',
    parameters: {
        id: 'username; in particular, if starts with `+`, it will be recognized as a [unique ID](https://github.com/DIYgod/RSSHub/issues/12221), e.g. `+44196397`',
        status: 'tweet ID',
        original: 'extra parameters, data type of return, if the value is not `0`/`false` and `config.isPackage` is `true`, return the original data of twitter',
    },
    features: {
        requireConfig: [
            {
                name: 'TWITTER_USERNAME',
                description: 'Please see above for details.',
            },
            {
                name: 'TWITTER_PASSWORD',
                description: 'Please see above for details.',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Tweet Details',
    maintainers: ['LarchLiu', 'Rongronggg9'],
    handler,
};

async function handler(ctx) {
    const id = ctx.req.param('id');
    const status = ctx.req.param('status');
    const routeParams = new URLSearchParams(ctx.req.param('original'));
    const original = fallback(undefined, queryToBoolean(routeParams.get('original')), false);
    const params = {
        focalTweetId: status,
        with_rux_injections: false,
        includePromotedContent: true,
        withCommunity: true,
        withQuickPromoteEligibilityTweetFields: true,
        withBirdwatchNotes: true,
        withVoice: true,
        withV2Timeline: true,
    };
    await api.init();
    const userInfo = await api.getUser(id);

    const profileImageUrl = userInfo.profile_image_url || userInfo.profile_image_url_https;
    //const item = original && config.isPackage ? data : utils.ProcessFeed(ctx, { data });
    let data;
    try {
        data = await  api.getUserTweetsAndReplies(id, params);
        if (!include_rts) {
            data = utils.excludeRetweet(data);
        }
    } catch (error) {
        logger.error(error);
    }
    console.log('返回数据量:', data?.length || 0);

    // 移除 user 字段
    const dataWithoutUser = removeUserFromTweets(data);

    // 处理 RSS 项目
    const feedItems = data ? utils.ProcessFeed(ctx, { data }) : [];

    // 添加处理后的数据到描述中
    if (feedItems.length > 0 && dataWithoutUser) {
        feedItems.forEach((item, index) => {
            let tweetData = dataWithoutUser[index];

            if (tweetData) {
                item.description = tweetData;
            }
        });
    }

    return {
        title: `Twitter @${userInfo.name}`,
        link: `https://x.com/${userInfo.screen_name}/status/${status}`,
        image: profileImageUrl.replace(/_normal.jpg$/, '.jpg'),
        description: userInfo.description,
        item: feedItems,
    };
}
