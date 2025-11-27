FROM node:22-bookworm AS build

WORKDIR /app

# Install pnpm and set up npm registry if using China mirror
ARG USE_CHINA_NPM_REGISTRY=0
RUN \
    set -ex && \
    corepack enable pnpm && \
    if [ "$USE_CHINA_NPM_REGISTRY" = 1 ]; then \
        echo 'use npm mirror' && \
        npm config set registry https://registry.npmmirror.com && \
        yarn config set registry https://registry.npmmirror.com && \
        pnpm config set registry https://registry.npmmirror.com ; \
    fi

# Copy package files and install dependencies
COPY ./tsconfig.json /app/
COPY ./pnpm-lock.yaml /app/
COPY ./package.json /app/

# Install dependencies, skipping Puppeteer download during install
RUN \
    set -ex && \
    export PUPPETEER_SKIP_DOWNLOAD=true && \
    pnpm install --frozen-lockfile && \
    pnpm rb

# Copy source code and build the project
COPY . /app
RUN pnpm build

# Stage 2: Final production stage
FROM node:22-bookworm-slim AS final

LABEL org.opencontainers.image.authors="https://github.com/DIYgod/RSSHub"

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

WORKDIR /app

# Install runtime dependencies
RUN \
    set -ex && \
    apt-get update && \
    apt-get install -yq --no-install-recommends \
        dumb-init git curl \
    # Install Chromium if needed (for non-amd64 platforms)
    && apt-get install -yq --no-install-recommends chromium \
    && echo "CHROMIUM_EXECUTABLE_PATH=$(which chromium)" | tee /app/.env \
    && rm -rf /var/lib/apt/lists/*

# Copy built files from build stage
COPY --from=build /app/dist /app/dist
COPY --from=build /app/lib /app/lib
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules

EXPOSE 1200

ENTRYPOINT ["dumb-init", "--"]

CMD ["npm", "run", "start"]