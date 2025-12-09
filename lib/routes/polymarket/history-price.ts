import { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';
import ofetch from '@/utils/ofetch';

export const route: Route = {
    path: '/history-price',
    categories: ['finance', 'other'],
    example: '/polymarket/history-price?market=102896645967618032899672048401145586398768279239962502103026967602245152252782&startTs=1763540871',
    parameters: {
        market: {
            description: '市场 ID，必需参数',
            required: true
        },
        startTs: {
            description: '开始时间戳（秒），必需参数',
            required: true
        },
        endTs: {
            description: '结束时间戳（秒），可选参数'
        },
        granularity: {
            description: '数据粒度，可选参数',
        }
    },
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
            source: ['polymarket.com/'],
            target: '/polymarket/history-price',
        },
    ],
    name: 'History Price',
    maintainers: ['WUQUANLONG'],
    handler,
};

async function handler(ctx) {
    console.log('=== 开始处理 Polymarket 历史价格请求 ===');

    const baseUrl = 'https://clob.polymarket.com';

    // 获取原始请求参数
    let queryParams = {};

    try {
        const rawReq = ctx.req?.originalReq || ctx.req;

        if (rawReq && rawReq.url) {
            console.log('原始请求 URL:', rawReq.url);

            const url = new URL(rawReq.url, 'http://localhost');
            queryParams = Object.fromEntries(url.searchParams);
            console.log('解析到的参数:', queryParams);
        }
    } catch (error) {
        console.log('参数解析失败:', error.message);
    }

    // 检查必需参数
    if (!queryParams.market) {
        throw new Error('缺少必需参数: market');
    }
    if (!queryParams.startTs) {
        throw new Error('缺少必需参数: startTs');
    }

    // 构建 API 查询参数
    const apiQueryParams = new URLSearchParams();

    // 添加必需参数
    apiQueryParams.append('market', queryParams.market);
    apiQueryParams.append('startTs', queryParams.startTs);

    // 添加可选参数
    if (queryParams.endTs) apiQueryParams.append('endTs', queryParams.endTs);
    if (queryParams.granularity) apiQueryParams.append('granularity', queryParams.granularity);

    const apiUrl = `${baseUrl}/prices-history?${apiQueryParams.toString()}`;

    console.log('最终 API URL:', apiUrl);

    try {
        const response = await ofetch(apiUrl, {
            timeout: 30000,
        });

        console.log('API 响应类型:', typeof response);
        //console.log('API 响应数据:', response);

        // 处理价格历史数据
        const items = processPriceHistory(response, queryParams.market);

        console.log(`成功获取到 ${items.length} 个价格数据点`);

        return {
            title: `Polymarket 价格历史 - Market ${queryParams.market}`,
            link: `https://polymarket.com/market/${queryParams.market}`,
            description: `市场 ${queryParams.market} 的价格历史数据 - 共 ${items.length} 个数据点`,
            item: items,
        };
    } catch (error) {
        console.error('Polymarket 价格历史 API 请求失败:', error);
        throw new Error(`Failed to fetch Polymarket price history: ${error.message}`);
    }
}

// 处理价格历史数据
function processPriceHistory(priceData: any, marketId: string) {
    const items = [];

    // 根据 API 响应结构处理数据
    if (Array.isArray(priceData)) {
        // 如果返回的是数组格式
        priceData.forEach((dataPoint, index) => {
            items.push({
                title: `价格数据点 ${index + 1} - 市场 ${marketId}`,
                link: `https://polymarket.com/market/${marketId}`,
                description: generatePriceDescription(dataPoint, marketId),
                pubDate: parseDate(dataPoint.timestamp || dataPoint.ts || dataPoint.time || Date.now()),
                category: ['price-history', 'polymarket'],
                guid: `price-${marketId}-${dataPoint.timestamp || index}-${Date.now()}`,
            });
        });
    } else if (priceData.prices && Array.isArray(priceData.prices)) {
        // 如果返回的是包含 prices 数组的对象
        priceData.prices.forEach((pricePoint: any, index: number) => {
            items.push({
                title: `价格点 ${index + 1} - ${marketId}`,
                link: `https://polymarket.com/market/${marketId}`,
                description: generatePriceDescription(pricePoint, marketId),
                pubDate: parseDate(pricePoint.timestamp || pricePoint.ts || index),
                category: ['price-history', 'polymarket'],
                guid: `price-${marketId}-${pricePoint.timestamp || index}`,
            });
        });
    } else if (typeof priceData === 'object') {
        // 如果是单个对象，直接处理
        items.push({
            title: `价格历史 - 市场 ${marketId}`,
            link: `https://polymarket.com/market/${marketId}`,
            description: generatePriceDescription(priceData, marketId),
            pubDate: parseDate(priceData.timestamp || priceData.ts || Date.now()),
            category: ['price-history', 'polymarket'],
            guid: `price-${marketId}-${Date.now()}`,
        });
    } else {
        // 未知格式，返回原始数据
        items.push({
            title: `价格历史数据 - 市场 ${marketId}`,
            link: `https://polymarket.com/market/${marketId}`,
            description: `原始价格数据: ${JSON.stringify(priceData, null, 2)}`,
            pubDate: parseDate(Date.now()),
            category: ['price-history', 'polymarket'],
            guid: `price-${marketId}-raw-${Date.now()}`,
        });
    }

    return items;
}

// 生成价格描述
function generatePriceDescription(priceData: any, marketId: string) {
    const dataCopy = JSON.parse(JSON.stringify(priceData));

    try {
        const jsonData = JSON.stringify(dataCopy, null, 2);

        return jsonData;
    } catch (error) {
        return generateFormattedPriceDescription(priceData);
    }
}

// 生成格式化的价格描述
function generateFormattedPriceDescription(priceData: any) {
    let description = '<ul>';

    // 遍历所有字段，生成格式化显示
    Object.keys(priceData).forEach(key => {
        if (priceData[key] !== null && priceData[key] !== undefined) {
            let value = priceData[key];

            // 特殊处理时间戳字段
            if (key.includes('timestamp') || key === 'ts' || key === 'time') {
                const date = new Date(Number(value) * 1000); // 假设是秒级时间戳
                value = `${value} (${date.toISOString()})`;
            }

            // 特殊处理价格字段
            if (key.includes('price') && typeof value === 'number') {
                value = (value * 100).toFixed(2) + '%';
            }

            description += `<li><strong>${key}:</strong> ${value}</li>`;
        }
    });

    description += '</ul>';

    return description;
}
