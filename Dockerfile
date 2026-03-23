# 构建阶段
FROM node:20 AS builder

# 安装编译 better-sqlite3 所需的工具
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 只复制依赖文件，利用 Docker 缓存
COPY package.json package-lock.json ./

# 安装所有依赖（包括 devDependencies 用于构建）
RUN npm install --registry https://registry.npmmirror.com/

# 复制源代码并构建
COPY . .
RUN npm run build

# 清理开发依赖，只保留生产依赖
RUN rm -rf node_modules && \
    npm install --omit=dev --registry https://registry.npmmirror.com/

# 最终运行镜像 - 使用 Debian 基础镜像（Playwright/Chromium 需要）
FROM node:20-slim

# 安装 Chromium 运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libdbus-1-3 \
    libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 只复制必要的文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/configs ./configs
COPY --from=builder /app/public ./public

# 安装 Playwright Chromium 浏览器
RUN npx playwright-core install chromium

# 创建数据目录
RUN mkdir -p /app/data

# 环境变量
ENV NODE_ENV=production
ENV DB_PATH=/app/data/jimeng.db

# 持久化数据卷
VOLUME ["/app/data"]

EXPOSE 8000

CMD ["npm", "start"]
