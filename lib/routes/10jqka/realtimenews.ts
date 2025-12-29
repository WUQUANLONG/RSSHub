import { Route } from '@/types';

import got from '@/utils/got';
import { load } from 'cheerio';
import iconv from 'iconv-lite';
import {formatDate, parseDate} from '@/utils/parse-date';


export const handler = async (ctx) => {
    const { tag } = ctx.req.param();
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit'), 20) : 50;

    const rootUrl = 'https://news.10jqka.com.cn';
    const apiUrl = new URL('tapp/news/push/stock', rootUrl).href;
    const currentUrl = new URL('realtimenews.html', rootUrl).href;

    const response = await got(currentUrl, {
        responseType: 'buffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'http://news.10jqka.com.cn/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
    });
    let html = ''; // 1. 在外部定义变量

    if (Buffer.isBuffer(response.data)) {
        // 2. 将解码后的字符串赋值给外部变量
        html = iconv.decode(response.data, 'gbk');
    } else if (typeof response.data === 'string') {
        // 兜底处理：如果是字符串（虽然设置 encoding: null 后不应该出现）
        html = response.data;
    } else {
        // 如果是对象或其他类型，转为字符串
        html = JSON.stringify(response.data);
    }

    const $ = load(html);

    const language = $('html').prop('lang');

    const response2 = await got(apiUrl, {
        searchParams: {
            page: 1,
            tag: tag ?? '',
        },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'http://news.10jqka.com.cn/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
    });
    //console.log('ssss', response2);
    let resString = '';

    if (Buffer.isBuffer(response2.data)) {
        // 1. 将整个二进制流从 GBK 转为 UTF-8 字符串
        // 使用 gb18030 兼容性更好
        resString = iconv.decode(response2.data, 'UTF-8');
    } else if (typeof response2.data === 'string') {
        // 如果已经变成了字符串且是乱码，说明在 curlNative 层面可能没传 encoding: null
        resString = response2.data;
    } else {
        resString = JSON.stringify(response2.data);
    }
    //console.log('ssss', resString);
    let resData = '';
    try {
        // 【关键】将字符串转换为真正的 JSON 对象
        resData = JSON.parse(resString);
        // 现在你可以像操作对象一样操作它了
        //console.log('--- 解析成功 ---');
        //console.log('第一条新闻标题:', resData.data.list[0].title);

    } catch (e) {
        console.error('JSON 解析失败，说明返回的内容不是标准 JSON 格式:', e);
    }

    //console.log('ssss', resData);
    const items =
        resData.data?.list.slice(0, limit).map((item) => {
            const title = item.title;
            const guid = `${item.seq}`;
            const image = item.picUrl;
            item.ctime = parseDate(item.ctime, 'X');
            item.rtime = parseDate(item.rtime, 'X');
            item.ctime = formatDate(new Date(item.ctime), 'YYYY-MM-DD HH:mm:ss');
            item.rtime = formatDate(new Date(item.rtime), 'YYYY-MM-DD HH:mm:ss');
            item.content = item.digest;

            return {
                title,
                description: item,
                pubDate: item.ctime,
                link: item.url,
                category: [...new Set([item.color === '2' ? '重要' : undefined, ...item.tags.map((c) => c.name), ...item.tagInfo.map((c) => c.name)])].filter(Boolean),
                author: item.source,
                guid,
                id: guid,
                image,
                banner: item.picUrl,
                updated: item.rtime,
                language,
            };
        }) ?? [];

    const title = $('title').text();
    const image = $('h1 a img').prop('src');

    return {
        title,
        link: currentUrl,
        item: items,
        allowEmpty: true,
        image,
        author: $('meta[property="og:site_name"]').prop('content'),
        language,
    };
};

export const route: Route = {
    path: '/realtimenews/:tag?',
    name: '7×24小时要闻直播',
    url: 'news.10jqka.com.cn',
    maintainers: ['nczitzk'],
    handler,
    example: '/10jqka/realtimenews',
    parameters: { tag: '标签，默认为全部' },
    description: `::: tip
  若订阅 [7×24小时要闻直播](https://news.10jqka.com.cn/realtimenews.html) 的 \`公告\` 标签。将 \`公告\` 作为标签参数填入，此时路由为 [\`/10jqka/realtimenews/公告\`](https://rsshub.app/10jqka/realtimenews/公告)。

  若订阅 [7×24小时要闻直播](https://news.10jqka.com.cn/realtimenews.html) 的 \`公告\` 和 \`A股\` 标签。将 \`公告,A股\` 作为标签参数填入，此时路由为 [\`/10jqka/realtimenews/公告,A股\`](https://rsshub.app/10jqka/realtimenews/公告,A股)。
:::

| 全部 | 重要 | A股 | 港股 | 美股 | 机会 | 异动 | 公告 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
    `,
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
            title: '全部',
            source: ['news.10jqka.com.cn/realtimenews.html'],
            target: '/realtimenews/全部',
        },
        {
            title: '重要',
            source: ['news.10jqka.com.cn/realtimenews.html'],
            target: '/realtimenews/重要',
        },
        {
            title: 'A股',
            source: ['news.10jqka.com.cn/realtimenews.html'],
            target: '/realtimenews/A股',
        },
        {
            title: '港股',
            source: ['news.10jqka.com.cn/realtimenews.html'],
            target: '/realtimenews/港股',
        },
        {
            title: '美股',
            source: ['news.10jqka.com.cn/realtimenews.html'],
            target: '/realtimenews/美股',
        },
        {
            title: '机会',
            source: ['news.10jqka.com.cn/realtimenews.html'],
            target: '/realtimenews/机会',
        },
        {
            title: '异动',
            source: ['news.10jqka.com.cn/realtimenews.html'],
            target: '/realtimenews/异动',
        },
        {
            title: '公告',
            source: ['news.10jqka.com.cn/realtimenews.html'],
            target: '/realtimenews/公告',
        },
    ],
};
