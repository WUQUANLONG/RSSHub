import { Route } from '@/types';

import got from '@/utils/got';
import sanitizeHtml from "sanitize-html";
import {parseDate} from "@/utils/parse-date";

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
    description: `提取虎扑步行街主干道的热帖数据，从 window.$$data.topic.threads.list 中获取`,
};

// 定义数据接口
interface Author {
    uid?: string;
    username?: string;
    nickname?: string;
    avatar?: string;
    level?: number;
    [key: string]: any;
}

interface Topic {
    tid?: string;
    name?: string;
    icon?: string;
    description?: string;
    color?: string;
    [key: string]: any;
}

interface ThreadItem {
    tid: string;
    title: string;
    cover: string;
    url: string;
    lights: number;
    replies: number;
    read: number;
    createdAt: number;
    createdAtFormat: string;
    repliedAt: number;
    hasVideo: boolean;
    author: Author;
    topicId: string;
    topic: Topic;
    titleFont: string;
    [key: string]: any;
}

interface ThreadsData {
    count: number;
    size: number;
    current: number;
    total: number;
    baseUrl: string;
    list: ThreadItem[];
    [key: string]: any;
}

interface TopicData {
    isLogin?: boolean;
    follow?: any[];
    hot?: any[];
    threads?: ThreadsData;
    [key: string]: any;
}

interface WindowData {
    topic?: TopicData;
    [key: string]: any;
}

async function handler(ctx) {
    // { id: 2, title: '最新回复', url: '/topic-daily' },
    // { id: 1, title: '最新发布', url: '/topic-daily-postdate' },
    // { id: 4, title: '24小时榜', url: '/topic-daily-hot' }
    // 请求的 url 可以改变
    const currentUrl = 'https://bbs.hupu.com/topic-daily-hot';
    // 请求页面
    const response = await got({
        method: 'get',
        url: currentUrl,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Referer': 'https://bbs.hupu.com/',
        },
    });

    const html = response.data;
    // 提取 window.$$data 数据
    const windowData = extractWindowData(html);

    if (!windowData) {
        throw new Error('无法从页面提取 window.$$data 数据');
    }

    //console.log('windowData.topic:', windowData.topic);
    //console.log('windowData.topic.threads:', windowData.topic?.threads);

    // 获取 threads.list 数据
    const threadsData = windowData.topic?.threads;
    const threadList = threadsData?.list || [];

    if (threadList.length === 0) {
        throw new Error('未找到帖子数据 (topic.threads.list 为空)');
    }
    //console.log(`成功提取到 ${threadList.length} 条帖子`);

    const items = threadList.map((thread) => {
        return {
            title: thread.title,
            link: `https://bbs.hupu.com${thread.url}`,
            description: JSON.stringify(thread, null, 2), // 深度JSON化
            author: thread.author?.username || thread.author?.nickname || '匿名用户',
            pubDate: new Date(thread.createdAt),
            guid: `hupu_${thread.tid}`,
            category: ['步行街主干道'],
        };
    });

    return {
        title: '虎扑步行街主干道热帖',
        link: currentUrl,
        description: `共 ${threadList.length} 条帖子，总浏览量: ${threadList.reduce((sum, item) => sum + item.read, 0)}`,
        item: items,

    };
}

/**
 * 从HTML中提取window.$$data数据
 */
function extractWindowData(html: string): WindowData | null {
    try {
        const startMarker = 'window.$$data=';
        const startIndex = html.indexOf(startMarker);

        if (startIndex === -1) {
            console.log('未找到 window.$$data');
            return null;
        }

        // 从开始位置向后提取JSON
        let jsonStr = '';
        let braceCount = 0;
        let inString = false;
        let escapeChar = false;

        // 找到JSON开始位置
        let pos = startIndex + startMarker.length;

        // 跳过空白字符
        while (pos < html.length && /\s/.test(html[pos])) {
            pos++;
        }

        // 验证第一个字符是否是 {
        if (html[pos] !== '{') {
            console.log('window.$$data 不是以 { 开头');
            return null;
        }

        // 遍历提取完整的JSON
        for (let i = pos; i < html.length; i++) {
            const char = html[i];

            // 处理转义字符
            if (escapeChar) {
                jsonStr += char;
                escapeChar = false;
                continue;
            }

            if (char === '\\') {
                jsonStr += char;
                escapeChar = true;
                continue;
            }

            if (char === '"' && !inString) {
                inString = true;
            } else if (char === '"' && inString) {
                inString = false;
            } else if (char === '{' && !inString) {
                braceCount++;
            } else if (char === '}' && !inString) {
                braceCount--;
            }

            jsonStr += char;

            // 当大括号匹配完成且不在字符串中时，JSON结束
            if (braceCount === 0 && !inString) {
                break;
            }

            // 安全限制
            if (i - pos > 500000) {
                console.log('JSON提取超出长度限制');
                break;
            }
        }

        // 尝试解析JSON
        try {
            const data = JSON.parse(jsonStr);
            return data;
        } catch (parseError) {
            console.log('JSON解析失败，尝试修复:', parseError.message);

            // 修复常见的JSON问题
            const fixedJson = fixJsonString(jsonStr);
            try {
                const data = JSON.parse(fixedJson);
                console.log('修复后成功解析 window.$$data');
                return data;
            } catch (secondError) {
                console.log('修复后仍然解析失败:', secondError.message);
                return null;
            }
        }
    } catch (error) {
        console.error('提取window.$$data失败:', error);
        return null;
    }
}

/**
 * 修复JSON字符串
 */
function fixJsonString(jsonStr: string): string {
    let result = jsonStr;

    // 1. 移除尾随逗号
    result = result.replace(/,\s*}/g, '}');
    result = result.replace(/,\s*]/g, ']');

    // 2. 修复未加引号的键
    result = result.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');

    return result;
}

// 如果你想要更简单的版本，直接返回原始数据：
async function directJsonHandler(ctx) {
    const currentUrl = 'https://bbs.hupu.com/topic-daily-hot';

    const response = await got({
        method: 'get',
        url: currentUrl,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://bbs.hupu.com/',
        },
    });

    const html = response.data;
    const windowData = extractWindowData(html);

    if (!windowData) {
        throw new Error('无法从页面提取 window.$$data 数据');
    }

    const threadsData = windowData.topic?.threads;

    if (!threadsData || !threadsData.list || threadsData.list.length === 0) {
        throw new Error('未找到帖子数据');
    }

    // 直接返回 threadsData.list，保持原顺序
    return {
        success: true,
        count: threadsData.list.length,
        threads: threadsData.list, // 保持原始数组顺序
        meta: {
            pagination: {
                count: threadsData.count,
                size: threadsData.size,
                current: threadsData.current,
                total: threadsData.total,
                baseUrl: threadsData.baseUrl,
            },
            source: 'window.$$data.topic.threads.list',
        },
    };
}

// 如果想在RSS格式中直接返回完整JSON：
async function rssWithFullJsonHandler(ctx) {
    const currentUrl = 'https://bbs.hupu.com/topic-daily-hot';

    const response = await got({
        method: 'get',
        url: currentUrl,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://bbs.hupu.com/',
        },
    });

    const html = response.data;
    const windowData = extractWindowData(html);

    if (!windowData) {
        throw new Error('无法从页面提取 window.$$data 数据');
    }

    const threadsData = windowData.topic?.threads;
    const threadList = threadsData?.list || [];

    if (threadList.length === 0) {
        throw new Error('未找到帖子数据');
    }

    // 创建一个包含所有数据的单个RSS条目
    return {
        title: '虎扑步行街主干道热帖数据',
        link: currentUrl,
        description: '虎扑步行街主干道完整帖子数据',
        item: [
            {
                title: `虎扑步行街热帖 (${threadList.length}条)`,
                link: currentUrl,
                description: `
                    <h3>数据统计</h3>
                    <p>帖子数量: ${threadList.length}</p>
                    <p>总浏览量: ${threadList.reduce((sum, item) => sum + item.read, 0)}</p>
                    <p>总回复数: ${threadList.reduce((sum, item) => sum + item.replies, 0)}</p>
                    <p>总点亮数: ${threadList.reduce((sum, item) => sum + item.lights, 0)}</p>

                    <h3>完整JSON数据</h3>
                    <pre><code>${JSON.stringify(threadList, null, 2)}</code></pre>
                `,
                pubDate: new Date(),
                guid: `hupu_data_${Date.now()}`,
            },
        ],
    };
}

// 导出函数
export { extractWindowData };
