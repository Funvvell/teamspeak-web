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
RUN chown -R node:node /app
USER node
EXPOSE 8080
# Required for PROTOCOL=ts3 unless ALLOW_OPEN=1. Prefer Authorization: Bearer over ?token=
CMD ["node", "node_modules/tsx/dist/cli.mjs", "gateway/src/index.ts"]
