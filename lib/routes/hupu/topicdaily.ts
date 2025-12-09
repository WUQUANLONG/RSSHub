import { Route } from '@/types';

import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import timezone from '@/utils/timezone';
import { parseDate, parseRelativeDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';

export const route: Route = {
    path: '/zhugandao/topic',
    categories: ['bbs'],
    example: '/hupu/zhugandao/topic',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['bbs.hupu.com/topic-daily-hot', 'bbs.hupu.com/'],
            target: '/zhugandao/topic',
        },
    ],
    name: '步行街主干道热帖',
    maintainers: ['wuquanlong'],
    handler,
    description: `提取虎扑步行街主干道的热帖数据`,
};

// 定义数据类型接口
interface ThreadItem {
    threadId?: string;
    title?: string;
    url?: string;
    replyCount?: number;
    viewCount?: number;
    author?: string;
    authorId?: string;
    createTime?: string;
    lastReplyTime?: string;
    // 其他可能的字段
}

interface TopicData {
    isLogin?: boolean;
    follow?: any[];
    hot?: any[];
    threads?: ThreadItem[];
}

interface WindowData {
    topic?: TopicData;
    threads?: ThreadItem[]; // 兼容两种结构
}

async function handler(ctx) {
    const currentUrl = 'https://bbs.hupu.com/topic-daily-hot';

    // 获取缓存
    const cacheKey = 'hupu_zhugandao_topic_threads';
    const cachedData = await cache.tryGet(
        cacheKey,
        async () => {
            const response = await got({
                method: 'get',
                url: currentUrl,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Referer: 'https://bbs.hupu.com/',
                },
            });

            const $ = load(response.data);
            const windowData = extractWindowDataFromHTML($);

            if (!windowData || (!windowData.topic?.threads && !windowData.threads)) {
                // 如果提取失败，回退到原来的解析方式
                console.log('无法提取window.$$data，使用备选解析方式');
                return {
                    threads: extractThreadsFallback($),
                    lastUpdated: Date.now(),
                };
            }

            // 优先使用topic.threads，如果没有则使用threads
            const threads = windowData.topic?.threads || windowData.threads || [];

            return {
                threads,
                lastUpdated: Date.now(),
            };
        },
        60, // 缓存5分钟
        false
    );

    // 转换数据为RSS格式
    const items = await Promise.all(
        (cachedData.threads || []).map((thread) =>
            cache.tryGet(
                `hupu_thread_${thread.threadId || thread.title}`,
                async () => {
                    const item: any = {
                        title: thread.title || '未命名帖子',
                        link: thread.url ? `https://bbs.hupu.com${thread.url}` : currentUrl,
                        author: thread.author || '虎扑用户',
                        pubDate: thread.createTime ? timezone(parseDate(thread.createTime), +8) : new Date(),
                        category: ['步行街主干道'],
                        guid: thread.threadId || `hupu_${Date.now()}_${Math.random()}`,
                    };

                    // 如果有URL，尝试获取详细内容
                    if (thread.url) {
                        try {
                            const detailResponse = await got({
                                method: 'get',
                                url: `https://bbs.hupu.com${thread.url}`,
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                },
                            });

                            const content = load(detailResponse.data);
                            const videos: any[] = [];

                            content('.hupu-post-video').each(function () {
                                videos.push({
                                    source: content(this).attr('src'),
                                    poster: content(this).attr('poster'),
                                });
                            });

                            // 提取作者信息
                            const author = content('.bbs-user-wrapper-content-name-span').first().text() || thread.author;
                            const postTime = content('.second-line-user-info').first().text();

                            item.author = author;
                            if (postTime) {
                                item.pubDate = timezone(parseRelativeDate(postTime), +8);
                            }

                            item.description = art(path.join(__dirname, 'templates/description.art'), {
                                videos,
                                description: content('.bbs-content').first().html() || thread.title,
                                replyCount: thread.replyCount,
                                viewCount: thread.viewCount,
                            });
                        } catch (error) {
                            console.error(`获取帖子详情失败: ${thread.url}`, error);
                            // 使用基本信息作为描述
                            item.description = art(path.join(__dirname, 'templates/description.art'), {
                                videos: [],
                                description: thread.title || '',
                                replyCount: thread.replyCount,
                                viewCount: thread.viewCount,
                            });
                        }
                    } else {
                        // 没有详细URL，使用基本信息
                        item.description = art(path.join(__dirname, 'templates/description.art'), {
                            videos: [],
                            description: thread.title || '',
                            replyCount: thread.replyCount,
                            viewCount: thread.viewCount,
                        });
                    }

                    return item;
                },
                3600 // 帖子详情缓存1小时
            )
        )
    );

    return {
        title: '虎扑社区 - 步行街主干道热帖',
        link: currentUrl,
        description: '虎扑步行街主干道最新热帖',
        language: 'zh-cn',
        item: items.filter(Boolean), // 过滤掉null/undefined
    };
}

/**
 * 从HTML中提取window.$$data数据
 */
function extractWindowDataFromHTML($: any): WindowData | null {
    try {
        // 查找包含window.$$data的script标签
        const scripts = $('script').toArray();

        for (const script of scripts) {
            const scriptContent = $(script).html();
            if (scriptContent && scriptContent.includes('window.$$data')) {
                // 提取JSON数据
                const match = scriptContent.match(/window\.\$\$data\s*=\s*(\{[\s\S]*?\})(?:\s*;|\s*$)/);

                if (match) {
                    try {
                        // 清理JSON字符串
                        let jsonStr = match[1]
                            .replace(/,\s*}/g, '}')
                            .replace(/,\s*]/g, ']')
                            .replace(/\/\/.*$/gm, '') // 移除行注释
                            .trim();

                        // 修复可能的JSON格式问题
                        jsonStr = fixJsonFormat(jsonStr);

                        const data = JSON.parse(jsonStr);
                        return data as WindowData;
                    } catch (jsonError) {
                        console.error('解析window.$$data JSON失败:', jsonError);
                        continue; // 尝试下一个script标签
                    }
                }
            }
        }

        // 如果没有找到window.$$data，尝试查找其他可能的数据变量
        for (const script of scripts) {
            const scriptContent = $(script).html();
            if (scriptContent) {
                // 尝试查找其他格式的数据
                const matches = [
                    ...scriptContent.matchAll(/var\s+__data\s*=\s*(\{[\s\S]*?\})(?:\s*;|\s*$)/g),
                    ...scriptContent.matchAll(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})(?:\s*;|\s*$)/g),
                    ...scriptContent.matchAll(/window\.data\s*=\s*(\{[\s\S]*?\})(?:\s*;|\s*$)/g),
                ];

                for (const match of matches) {
                    try {
                        let jsonStr = match[1]
                            .replace(/,\s*}/g, '}')
                            .replace(/,\s*]/g, ']')
                            .trim();

                        jsonStr = fixJsonFormat(jsonStr);
                        const data = JSON.parse(jsonStr);

                        // 检查数据结构是否包含我们需要的信息
                        if (data.topic || data.threads) {
                            return data as WindowData;
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
        }
    } catch (error) {
        console.error('提取window.$$data失败:', error);
    }

    return null;
}

/**
 * 修复JSON格式
 */
function fixJsonFormat(jsonStr: string): string {
    // 添加更多修复逻辑
    return jsonStr
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // 为未加引号的键添加引号
        .replace(/:\s*'([^']*)'/g, ':"$1"') // 将单引号转换为双引号
        .replace(/:\s*true/g, ':true') // 修复布尔值
        .replace(/:\s*false/g, ':false')
        .replace(/:\s*null/g, ':null');
}

/**
 * 备选解析方式 - 从HTML结构中提取帖子
 */
function extractThreadsFallback($: any): ThreadItem[] {
    const threads: ThreadItem[] = [];

    // 从HTML中解析帖子列表
    $('.bbs-sl-web-post-body').each((index, element) => {
        const $el = $(element);

        const titleLink = $el.find('.post-title a.p-title');
        const title = titleLink.text().trim();
        const url = titleLink.attr('href');
        const datum = $el.find('.post-datum').text().trim();
        const author = $el.find('.post-auth a').text().trim();
        const timeText = $el.find('.post-time').text().trim();

        // 解析回复/浏览数
        let replyCount = 0;
        let viewCount = 0;
        if (datum) {
            const [replyStr, viewStr] = datum.split(' / ');
            replyCount = parseInt(replyStr) || 0;
            viewCount = parseInt(viewStr?.replace(/[^\d]/g, '')) || 0;
        }

        // 提取可能的threadId
        let threadId = '';
        if (url) {
            const match = url.match(/\/(\d+)\.html/);
            threadId = match ? match[1] : '';
        }

        threads.push({
            threadId: threadId || `fallback_${index}`,
            title,
            url,
            replyCount,
            viewCount,
            author,
            createTime: timeText,
        });
    });

    return threads;
}

// 导出辅助函数供测试或其他模块使用
export { extractWindowDataFromHTML, extractThreadsFallback };
