FROM node:20-alpine AS build
WORKDIR /app
ENV CI=1
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm pkg set name="fourmkit-frontend" version="0.1.0" >/dev/null 2>&1 || true
RUN if [ -f package.json ]; then npm install --no-audit --no-fund; fi
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist ./
# 確保正確的權限設定
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    find /usr/share/nginx/html -type f -exec chmod 644 {} \;
# 若未提供自訂 nginx.conf 則忽略（建議後續提供）
# COPY nginx.conf /etc/nginx/conf.d/default.conf
