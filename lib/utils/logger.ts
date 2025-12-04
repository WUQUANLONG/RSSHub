import path from 'node:path';
import winston from 'winston';
import { config } from '@/config';

let transports: (typeof winston.transports.File)[] = [];
if (!config.noLogfiles && !process.env.VERCEL) {
    transports = [
        new winston.transports.File({
            filename: path.resolve('logs/error.log'),
            level: 'error',
        }),
        new winston.transports.File({ filename: path.resolve('logs/combined.log') }),
    ];
}

const logger = winston.createLogger({
    level: config.loggerLevel,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.printf((info) =>
            JSON.stringify({
                timestamp: info.timestamp,
                level: info.level,
                message: info.message,
            })
        )
    ),
    transports,
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (!config.isPackage) {
    logger.add(
        new winston.transports.Console({
            format: winston.format.printf((info) => {
                const infoLevel = winston.format.colorize().colorize(info.level, config.showLoggerTimestamp ? `[${info.timestamp}] ${info.level}` : info.level);
                return `${infoLevel}: ${info.message}`;
            }),
            silent: process.env.NODE_ENV === 'test',
        })
    );
}

/**
 * 脱敏代理URI中的密码信息
 * 将 http://username:password@host:port 转换为 http://username:***@host:port
 */
export function maskProxyUri(uri: string): string {
    if (!uri) return uri;

    try {
        // 使用 URL API 更准确地解析
        const url = new URL(uri);
        if (url.password) {
            url.password = '***';
        }
        return url.toString();
    } catch (error) {
        // 如果 URL 解析失败，使用正则表达式作为后备方案
        return uri.replace(/(https?:\/\/)([^:@]+):([^@]+)@/, '$1$2:***@');
    }
}

/**
 * 安全地记录代理信息（自动脱敏）
 */
export function proxyInfo(message: string, uri: string) {
    const maskedUri = maskProxyUri(uri);
    logger.info(`${message}: ${maskedUri}`);
}

/**
 * 安全地记录代理错误信息
 */
export function proxyError(message: string, uri: string, error?: any) {
    const maskedUri = maskProxyUri(uri);
    const errorMsg = error ? ` - ${error.message || error}` : '';
    logger.error(`${message}: ${maskedUri}${errorMsg}`);
}

export default logger;
