import * as cheerio from 'cheerio';

import * as fs from 'fs';
import * as path from 'path';
import {ofetch} from "ofetch";
export function parseAlaData(content: string): any {
    try {
        // 1. 找到 data: { 的位置
        const dataIndex = content.indexOf('data: {');
        if (dataIndex === -1) {
            //console.log('未找到 data: {');
            return null;
        }

        // 2. 从 { 开始的位置
        const startIndex = content.indexOf('{', dataIndex);
        if (startIndex === -1) {
            //console.log('未找到 JSON 开始位置');
            return null;
        }

        // 3. 逐字符解析，找到匹配的 }
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;
        let jsonEnd = -1;

        for (let i = startIndex; i < content.length; i++) {
            const char = content[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"') {
                if (!inString) {
                    inString = true;
                } else if (content[i - 1] !== '\\') {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '{') {
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        jsonEnd = i + 1;
                        break;
                    }
                }
            }
        }

        if (jsonEnd === -1) {
            //console.log('未找到完整的 JSON 对象');
            return null;
        }

        // 4. 提取 JSON 字符串
        const jsonStr = content.substring(startIndex, jsonEnd);
        //console.log('提取的 JSON 长度:', jsonStr.length);
        //console.log('JSON 片段:', jsonStr.substring(0, 100));

        // 5. 解析 JSON
        return JSON.parse(jsonStr);

    } catch (error) {
        //console.error('解析失败:', error.message);
        return null;
    }
}

/**
 * 获取所有 ala-data script 标签的内容（用于调试）
 */
export function getAllAlaDataScripts(html: string): string[] {
    const $ = cheerio.load(html);
    const scripts: string[] = [];

    $('script[data-for="ala-data"]').each((index, element) => {
        const content = $(element).html();
        if (content) {
            scripts.push(content);
            //console.log(`[HTML解析] 找到第 ${index + 1} 个 ala-data 脚本，长度: ${content.length}`);
        }
    });

    return scripts;
}

// 默认导出
export default {
    parseAlaData,
    getAllAlaDataScripts,
};


// const searchUrl = `https://so.toutiao.com/search?keyword=我国已经进入拉尼娜状态`;
//
// const response = await ofetch(searchUrl, {
//     method: 'GET',
//     headers: {
//         'User-Agent': 'curl/8.2.1', // 使用和 curl 一样的 User-Agent
//         'Accept': '*/*', // 使用和 curl 一样的 Accept 头
//         'Accept-Encoding': 'gzip, deflate, br',
//         'Connection': 'keep-alive',
//     },
//     // 特别针对 ofetch 的选项
//     responseType: 'text', // 确保返回文本
//     parseResponse: (txt) => txt, // 不自动解析
// });
// //const htmlText = await response.text();
// const s = getAllAlaDataScripts(response);
// console.log('sssss', s.length);
// const conte = parseAlaData(s[1]);
// console.log('ssss', conte);


// const filePath = '/Users/wuquanlong/lcmf/wwwroot/RSSHub/tt.html';
//
// console.log('读取文件:', filePath);
// // 读取文件内容
// const htmlContent = fs.readFileSync(filePath, 'utf-8');
// console.log('文件大小:', htmlContent.length, '字符');
//
// // 查看文件前500个字符
// console.log('\n=== 文件前500字符 ===');
// console.log(htmlContent.substring(0, 500));
// console.log('===================\n');
//
// // 获取所有脚本
// const scripts = getAllAlaDataScripts(htmlContent);
// console.log('ssss', scripts.length);
