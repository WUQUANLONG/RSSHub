# 阶段1：构建应用
FROM node:22-alpine AS builder

WORKDIR /app

# 启用 pnpm
RUN corepack enable pnpm

# 设置国内 npm 镜像（可选）
ARG USE_CHINA_NPM_REGISTRY=0
RUN if [ "$USE_CHINA_NPM_REGISTRY" = "1" ]; then \
    echo "使用 npm 镜像" && \
    npm config set registry https://registry.npmmirror.com && \
    pnpm config set registry https://registry.npmmirror.com ; \
    fi

# 复制依赖文件
COPY ./tsconfig.json ./
COPY ./pnpm-lock.yaml ./
COPY ./package.json ./

# 安装依赖（跳过 Puppeteer 下载）
RUN \
    set -ex && \
    export PUPPETEER_SKIP_DOWNLOAD=true && \
    pnpm install --frozen-lockfile

# 复制源代码并构建
COPY . .
RUN pnpm build

# 阶段2：最终镜像
FROM rsshub-chrome-alpine:v1

LABEL org.opencontainers.image.authors="wuquanlong@licaimofang.com"

# 切换到 root 用户进行后续操作
USER root

WORKDIR /app

# 复制应用文件并设置权限
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/lib /app/lib
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules

# 确保所有文件属于 pptruser
RUN chown -R pptruser:pptruser /app

# 创建运行时目录
RUN mkdir -p /app/logs /app/cache && \
    chown -R pptruser:pptruser /app/logs /app/cache && \
    chmod 755 /app/logs /app/cache

# 设置环境变量
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    CACHE_TYPE=memory \
    CACHE_EXPIRE=300 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROMIUM_FLAGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --headless=new"

# 切换回非 root 用户
USER pptruser

# 暴露端口
EXPOSE 1200

# 启动命令
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]
