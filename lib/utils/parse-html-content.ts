export function decodeAndExtractText(
    rawContent: string,
    options: {
        preserveNewlines?: boolean;
        decodeHtmlEntities?: boolean;
        keepLinkText?: boolean;
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
        processed = processed.replace(/\\\\u/g, '\\u');
        processed = processed.replace(/\\u([\da-f]{4})/gi,
            (_, hex) => String.fromCharCode(parseInt(hex, 16))
        );

        // 2. 处理特定的 HTML 标签和实体
        if (preserveNewlines) {
            processed = processed
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<\/div>/gi, '\n')
                .replace(/<\/h[1-6]>/gi, '\n');
        }

        // 3. 处理链接标签
        if (keepLinkText) {
            processed = processed.replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>([^<]*)<\/a>/gi, '$1');
        }

        // 4. 移除所有 HTML 标签
        processed = processed.replace(/<[^>]*>/g, '');

        // 🔥 新增：专门移除 --\u003E 和类似的模式
        // 移除 HTML 注释结束标记（已解码和未解码的）
        processed = processed
            .replace(/--\\u003E/gi, '')      // 移除 --\u003E（未解码的）
            .replace(/--\u003E/gi, '')       // 移除 --\u003E（已解码的）
            .replace(/--\\u003C!--/gi, '')   // 移除 --\u003C!--
            .replace(/--<!--/gi, '')         // 移除 --<!--
            .replace(/-->$/g, '')            // 移除末尾的 -->
            .replace(/^<!--/g, '');          // 移除开头的 <!--

        // 5. 解码 HTML 实体
        if (decodeHtmlEntities) {
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
            processed = processed
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .replace(/\t/g, ' ')
                .replace(/\f/g, ' ')
                .replace(/\v/g, ' ')
                .replace(/\u00A0/g, ' ')
                .replace(/[\u2000-\u200F]/g, ' ')
                .replace(/\u2028/g, '\n')
                .replace(/\u2029/g, '\n\n');
        }

        // 7. 清理多余空白
        if (preserveNewlines) {
            processed = processed
                .replace(/[ \t]+/g, ' ')
                .replace(/^[ \t]+|[ \t]+$/gm, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        } else {
            processed = processed
                .replace(/\s+/g, ' ')
                .trim();
        }

        // 8. 移除控制字符
        const controlCharsRegex = preserveNewlines
            ? /[\x00-\x09\x0B-\x1F\x7F]/g
            : /[\x00-\x1F\x7F]/g;
        processed = processed.replace(controlCharsRegex, '');

    } catch (error) {
        console.warn('文本处理失败，返回原始内容:', error);
        return rawContent.replace(/\s+/g, ' ').trim();
    }

    return processed;
}
