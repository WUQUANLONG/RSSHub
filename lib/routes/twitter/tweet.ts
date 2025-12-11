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
    data = await  api.getUserTweet(id, params);
    // data 数据中的日期，需要统一处理一下
    let processData = processTwitterData(data);

    return {
        title: `Twitter @${userInfo.name}`,
        link: `https://x.com/${userInfo.screen_name}/status/${status}`,
        image: profileImageUrl.replace(/_normal.jpg$/, '.jpg'),
        description: userInfo.description,
        item: processData,
    };
}

/**
 * 解析 Twitter/X 格式的日期字符串
 * @param twitterDate Twitter/X 格式的日期字符串，如: "Thu Dec 11 11:55:00 +0000 2025"
 * @param format 输出格式，默认: "YYYY-MM-DD HH:mm:ss"
 * @returns 格式化后的日期字符串
 */
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
