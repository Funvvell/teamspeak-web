# Build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PROTOCOL=ts3
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY gateway ./gateway
COPY shared ./shared
# tsx runs TypeScript gateway in production (small dep, simpler than bundling)
RUN npm install tsx --no-save
EXPOSE 8080
CMD ["npx", "tsx", "gateway/src/index.ts"]
