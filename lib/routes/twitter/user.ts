import { Route, ViewType } from '@/types';
import utils from './utils';
import api from './api';
import logger from '@/utils/logger';

export const route: Route = {
    path: '/user/:id/:routeParams?',
    categories: ['social-media'],
    view: ViewType.SocialMedia,
    example: '/twitter/user/_RSSHub',
    parameters: {
        id: 'username; in particular, if starts with `+`, it will be recognized as a [unique ID](https://github.com/DIYgod/RSSHub/issues/12221), e.g. `+44196397`',
        routeParams: 'extra parameters, see the table above',
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
            {
                name: 'TWITTER_AUTHENTICATION_SECRET',
                description: 'TOTP 2FA secret, please see above for details.',
                optional: true,
            },
            {
                name: 'TWITTER_AUTH_TOKEN',
                description: 'Please see above for details.',
            },
            {
                name: 'TWITTER_THIRD_PARTY_API',
                description: 'Use third-party API to query twitter data',
                optional: true,
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'User timeline',
    maintainers: ['DIYgod', 'yindaheng98', 'Rongronggg9', 'CaoMeiYouRen', 'pseudoyu'],
    handler,
    radar: [
        {
            source: ['x.com/:id'],
            target: '/user/:id',
        },
    ],
};

// 辅助函数：移除推文中的 user 字段
function removeUserFromTweets(tweets) {
    if (!tweets || !Array.isArray(tweets)) {
        return [];
    }

    return tweets.map(tweet => {
        // 使用 JSON 方法进行深拷贝
        const tweetCopy = JSON.parse(JSON.stringify(tweet));

        // 移除 user 字段
        delete tweetCopy.user;

        // 可选：保留一些有用的用户基本信息
        // 如果需要用户ID，可以单独保留
        if (tweet.user_id_str) {
            tweetCopy.author_id = tweet.user_id_str;
        }
        if (tweet.user?.screen_name) {
            tweetCopy.author_username = tweet.user.screen_name;
        }

        return tweetCopy;
    });
}

async function handler(ctx) {
    const id = ctx.req.param('id');

    // For compatibility
    const { count, include_replies, include_rts } = utils.parseRouteParams(ctx.req.param('routeParams'));
    const params = count ? { count } : {};

    await api.init();
    const userInfo = await api.getUser(id);
    let data;
    try {
        data = await (include_replies ? api.getUserTweetsAndReplies(id, params) : api.getUserTweets(id, params));
        if (!include_rts) {
            data = utils.excludeRetweet(data);
        }
    } catch (error) {
        logger.error(error);
    }

    const profileImageUrl = userInfo?.profile_image_url || userInfo?.profile_image_url_https;

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
    console.log('ssss', feedItems);
    return {
        title: `Twitter @${userInfo?.name}`,
        link: `https://x.com/${userInfo?.screen_name}`,
        image: profileImageUrl?.replace(/_normal.jpg$/, '.jpg'),
        description: userInfo?.description,
        item: feedItems,
        allowEmpty: true,
    };
}
