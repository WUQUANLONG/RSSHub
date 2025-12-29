import iconv from 'iconv-lite';
import { curlRaw, CurlOptions } from './curl-engine';

export const request = {
    async get(url: string, options: CurlOptions = {}) {
        const buffer = await curlRaw(url, { ...options, method: 'GET' });

        return {
            rawBody: buffer,
            json: <T = any>(): T => {
                // 尝试转码
                let text = iconv.decode(buffer, 'utf-8');

                // 防御性清洗：处理连体 JSON 或前后杂质
                const clean = (s: string) => {
                    const f = s.indexOf('{');
                    const l = s.lastIndexOf('}');
                    if (f === -1) return s;
                    let res = s.slice(f, l + 1);
                    const double = res.indexOf('}{');
                    return double !== -1 ? res.slice(0, double + 1) : res;
                };

                try {
                    return JSON.parse(clean(text));
                } catch (e) {
                    // 备选 GBK 解析
                    text = iconv.decode(buffer, 'gbk');
                    return JSON.parse(clean(text));
                }
            },
            text: (encoding: string = 'utf-8') => {
                return iconv.decode(buffer, encoding);
            }
        };
    }
};
