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
    const feedItems = data ?  processTwitterData(data) : [];

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
        title: `Twitter @${userInfo?.name}`,
        link: `https://x.com/${userInfo?.screen_name}`,
        image: profileImageUrl?.replace(/_normal.jpg$/, '.jpg'),
        description: userInfo?.description,
        item: feedItems,
        allowEmpty: true,
    };
}

function parseTwitterDate(
    twitterDate: string,
    format: string = 'YYYY-MM-DD HH:mm:ss'
): string {
    if (!twitterDate) return '';

    try {
        // Twitter/X 日期格式: "Thu Dec 11 11:55:00 +0000 2025"
        const date = new Date(twitterDate);

        // 检查日期是否有效
        if (isNaN(date.getTime())) {
            console.warn('Invalid Twitter date:', twitterDate);
            return '';
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return format
            .replace('YYYY', year.toString())
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    } catch (error) {
        console.error('Error parsing Twitter date:', twitterDate, error);
        return '';
    }
}

/**
 * 处理整个数据列表
 */
function processTwitterData(data: any[]) {
    return data.map((tweet) => {
        // 处理推文创建时间
        const formattedDate = parseTwitterDate(tweet.created_at);

        // 如果需要，也可以处理用户创建时间
        const userCreatedAt = tweet.user?.created_at
            ? parseTwitterDate(tweet.user.created_at)
            : '';

        tweet.created_at = formattedDate;
        if (tweet.user.created_at) {

            tweet.user.created_at = userCreatedAt;
        }

        return {
            title: tweet.full_text || ``,
            link: '',
            pubDate: formattedDate,
            description: tweet,
        };
    });
}
