import { Route } from '@/types';

import got from '@/utils/got';
import { load } from 'cheerio';
import iconv from 'iconv-lite';
import cache from "@/utils/cache";
import {formatDate, parseDate} from '@/utils/parse-date';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";

function extractArticleSimple(html) {
    const $ = load(html);

    // 1. 提取标题
    let title = '';
    let pubDate = '';
    const ldJsonScript = $('script[type="application/ld+json"]').first().html();
    if (ldJsonScript) {
        try {
            const fixedJson = ldJsonScript.trim().replace(/,\s*}/g, '}');
            const jsonData = JSON.parse(fixedJson);
            title = jsonData.headline || '';
            pubDate = jsonData.datePublished;
        } catch (error) {
            console.warn('JSON-LD 解析失败');
            const jsonData = {};
        }
    }

    if (!title) {
        title = $('title').text().trim();
    }

    // 2. 提取正文内容
    const contentHtml = $('#contentApp').html() || '';
    // console.log('ssss', contentHtml);
    let fullContent = decodeAndExtractText(contentHtml);
    let images = extractImageUrlsWithCheerio(contentHtml);

    if (title && fullContent) {
        return {
            title,
            description: {content: fullContent, content_images: images},
            pubDate: pubDate,
        };
    }
    return null;
}
export const handler = async (ctx) => {
    const { tag } = ctx.req.param();

    const tag_list = {
        today_list: '财经要闻',
        cjzx_list: '宏观经济',
        cjkx_list: '产经新闻',
        guojicj_list: '国际财经',
        jrsc_list: '金融市场',
        fssgsxw_list: '公司新闻',
        region_list: '区域经济',
        fortune_list: '财经评论',
        cjrw_list: '财经人物',
        ycall_list: '原创滚动',
        djpingpan_list: '盘评',
        djkuaiping_list: '快评',
        zjpingpan_list: '资金评盘',
        djggjd_list: '公告解读',
        djgshd_list: '公司互动',
        djsjdp_list: '数据解读',
        mrnxgg_list: '涨停解密',
        djsdfx_list: '深度分析',
    };
    const tagKey = tag || 'today_list';
    // 从 tag_list 获取对应的标题
    let title = tag_list[tagKey] || '';
    if (!title) {
        title = tagKey;
    }

    const rootUrl = 'https://news.10jqka.com.cn';

    const currentUrl = new URL(`/${tagKey}/index.shtml`, rootUrl).href;

    // 返回是 html，获取文章的列表，主要是列表中的 url
    const { data: currentResponse } = await got(currentUrl, {
        responseType: 'buffer',
    });
    // <div class="list-con">
    // <ul>
    //
    //     <li>
    //         <span class="arc-title">
    // <a target="_blank" title="报告：中国可持续发展综合指数连续稳步增长" href="http://news.10jqka.com.cn/20251218/c673309184.shtml" class="news-link" data-seq="673309184">报告：中国可持续发展综合指数连续稳步增长</a>
    // <span>12月18日 14:19</span>

    const $ = load(iconv.decode(currentResponse, 'gbk'));
    const hrefs = [];
    $('.content-1200 .arc-title .news-link').each((index, element) => {
        const href = $(element).attr('href');
        if (href) {
            hrefs.push(href);
        }
    });
    //console.log('sssss', hrefs);
    // 遍历 hrefs 来回去数据
    let items = [];
    for (const hurl of hrefs) {
        const item = await cache.tryGet(hurl, async () => {
            try {
                // 1. 获取页面
                const response = await got(hurl, {
                    responseType: 'buffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'http://news.10jqka.com.cn/',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    },
                });

                // 2. 解码 GBK
                const html = iconv.decode(response.data, 'gbk');

                // 3. 解析数据
                const res = extractArticleSimple(html);

                if (res) {
                    return {
                        title: res.title,
                        description: res.description,
                        pubDate: res.pubDate,
                        link: hurl,
                        guid : hurl,
                        id: hurl,
                    };
                }
                return null; // 如果解析失败，返回 null

            } catch (error) {
                console.error(`处理链接失败 ${hurl}:`, error.message);
                // 返回一个降级的项目
                return null;
            }
        }, 5);

        if (item) {
            items.push(item);
        }
        // 可选：添加延迟避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
        title: `同花顺财经 - ${title} - ${tagKey}`,
        link: currentUrl,
        item: items,
        description: `同花顺财经 - ${title} - 最新`,
    };
};



export const route: Route = {
    path: '/news/:tag?',
    name: '7×24小时要闻直播',
    url: 'news.10jqka.com.cn',
    maintainers: ['wuquanlong'],
    handler,
    example: '/10jqka/news',
    parameters: { tag: '标签，默认为 today_list' },
    description: `::: tip
| id | href | target |
|----|------|--------|
| list_today | http://news.10jqka.com.cn/today_list/ | 财经要闻 |
| list_cjzx | http://news.10jqka.com.cn/cjzx_list/ | 宏观经济 |
| list_cjkx | http://news.10jqka.com.cn/cjkx_list/ | 产经新闻 |
| list_guojicj | http://news.10jqka.com.cn/guojicj_list/ | 国际财经 |
| list_jrsc | http://news.10jqka.com.cn/jrsc_list/ | 金融市场 |
| list_fssgsxw | http://news.10jqka.com.cn/fssgsxw_list/ | 公司新闻 |
| list_region | http://news.10jqka.com.cn/region_list/ | 区域经济 |
| list_fortune | http://news.10jqka.com.cn/fortune_list/ | 财经评论 |
| list_cjrw | http://news.10jqka.com.cn/cjrw_list/ | 财经人物 |
:::`,
    categories: ['finance'],

    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportRadar: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            title: 'today_list',
            source: ['https://news.10jqka.com.cn/today_list/index.shtml'],
            target: '/news/today_list',
        },
    ],
};
