# IMC&IPM 前端（Next.js 14）生产镜像
# 注意：NEXT_PUBLIC_API_BASE 是「构建期」注入的，改公网地址后必须重新 build 镜像。

# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 浏览器访问后端的根地址（不要带 /api，前端调用路径里已含 /api）
ARG NEXT_PUBLIC_API_BASE=http://localhost:18005
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 只装生产依赖（next 在 dependencies 中），构建产物从 builder 拷贝
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 13005
# package.json 中 start = next start --hostname 0.0.0.0 --port 13005
CMD ["npm", "run", "start"]
