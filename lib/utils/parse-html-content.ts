/**
 * 解码 Unicode 转义字符并提取纯文本
 * @param rawContent 包含 \u003c 等 Unicode 转义字符的原始字符串
 * @param options 配置选项
 * @returns 清理后的纯文本
 */
export function decodeAndExtractText(
    rawContent: string,
    options: {
        /** 是否保留换行符（默认 false） */
        preserveNewlines?: boolean;
        /** 是否解码 HTML 实体（默认 true） */
        decodeHtmlEntities?: boolean;
        /** 是否保留链接文本（默认 true） */
        keepLinkText?: boolean;
        /** 是否转换为标准空格（默认 true） */
        normalizeSpaces?: boolean;
    } = {}
): string {
    const {
        preserveNewlines = false,
        decodeHtmlEntities = true,
        keepLinkText = true,
        normalizeSpaces = true
    } = options;

    if (!rawContent || typeof rawContent !== 'string') {
        return '';
    }

    let processed = rawContent;

    try {
        // 1. 解码 Unicode 转义字符
        processed = processed.replace(/\\u([\da-f]{4})/gi,
            (_, hex) => String.fromCharCode(parseInt(hex, 16))
        );

        // 2. 处理特定的 HTML 标签和实体
        if (preserveNewlines) {
            // 将特定标签转换为换行符
            processed = processed
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<\/div>/gi, '\n')
                .replace(/<\/h[1-6]>/gi, '\n');
        }

        // 3. 处理链接标签
        if (keepLinkText) {
            // 提取链接文本内容
            processed = processed.replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>([^<]*)<\/a>/gi, '$1');
        }

        // 4. 移除所有 HTML 标签（保留转换后的内容）
        processed = processed.replace(/<[^>]*>/g, '');

        // 5. 解码 HTML 实体
        if (decodeHtmlEntities) {
            // 常见 HTML 实体映射
            const htmlEntities: Record<string, string> = {
                '&lt;': '<',
                '&gt;': '>',
                '&amp;': '&',
                '&quot;': '"',
                '&#39;': "'",
                '&apos;': "'",
                '&nbsp;': ' ',
                '&copy;': '©',
                '&reg;': '®',
                '&trade;': '™',
                '&hellip;': '…',
                '&mdash;': '—',
                '&ndash;': '–',
            };

            processed = processed.replace(
                /&(?:[a-z]+|#x?[\da-f]+);/gi,
                (entity) => htmlEntities[entity] || ' '
            );
        }

        // 6. 标准化空白字符
        if (normalizeSpaces) {
            // 处理各种空白字符
            processed = processed
                .replace(/\r\n/g, '\n')      // Windows 换行
                .replace(/\r/g, '\n')        // Mac 换行
                .replace(/\t/g, ' ')         // 制表符转空格
                .replace(/\f/g, ' ')         // 换页符转空格
                .replace(/\v/g, ' ')         // 垂直制表符转空格
                .replace(/\u00A0/g, ' ')     // 不换行空格
                .replace(/\u2000-\u200F/g, ' ')  // 各种特殊空格
                .replace(/\u2028/g, '\n')    // 行分隔符
                .replace(/\u2029/g, '\n\n'); // 段落分隔符
        }

        // 7. 清理多余空白
        if (preserveNewlines) {
            // 保留换行时的处理
            processed = processed
                .replace(/[ \t]+/g, ' ')           // 合并连续空格
                .replace(/^[ \t]+|[ \t]+$/gm, '')  // 去除每行首尾空格
                .replace(/\n{3,}/g, '\n\n')        // 最多保留两个连续换行
                .trim();
        } else {
            // 不保留换行的处理
            processed = processed
                .replace(/\s+/g, ' ')  // 所有空白合并为单个空格
                .trim();
        }

        // 8. 移除控制字符（除了换行符）
        const controlCharsRegex = preserveNewlines
            ? /[\x00-\x09\x0B-\x1F\x7F]/g
            : /[\x00-\x1F\x7F]/g;
        processed = processed.replace(controlCharsRegex, '');

    } catch (error) {
        console.warn('文本处理失败，返回原始内容:', error);
        // 出错时返回原始内容（简单清理）
        return rawContent.replace(/\s+/g, ' ').trim();
    }

    return processed;
}
