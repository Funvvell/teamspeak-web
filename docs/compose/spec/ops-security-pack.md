---
feature: ops-security-pack
status: in-progress
updated: 2026-09-12
branch: master
commits: (pending)
---

# 运维安全包

## Report

## [S1] Problem

公网部署无鉴权，任何人可滥用网关连任意 TS 服务器；无默认服务器配置与健康检查。

## [S2] Design

### 网关 Token

- 环境变量 `GATEWAY_TOKEN`（空 = 不校验，兼容本地开发）
- 校验方式：
  - HTTP：`Authorization: Bearer <token>` 或 `?token=`
  - WebSocket：连接 URL `?token=` 或首条 JSON `{ type: 'auth', token }`
- 失败：HTTP 401 / WS 先发 `{ type: 'error', code: 'unauthorized' }` 再关闭
- 前端：`localStorage tsweb:token`；设置里可填；连接时带上

### 默认服务器

- `DEFAULT_HOST` / `DEFAULT_PORT` / `DEFAULT_NICKNAME` 环境变量
- 网关 `/config` 返回 JSON；前端首次加载预填
- 仍可手动改（访客模式）

### 健康检查

- `GET /health` → `{ ok: true, protocol, uptimeSec }`
- 供 Docker/反代探活

## [S3] Out of Scope

- 多用户账号、OAuth
- TLS 终止（由反代负责）
- 速率限制完整实现

## Tasks

- [x] T1: 网关 token 校验 + /config + /health — health/config 返回 JSON (covers: S2)
- [x] T2: 前端 token 存储与 WS 携带 (covers: S2; depends: T1)
- [x] T3: 默认服务器预填 (covers: S2; depends: T1)
- [x] T4: 验证 typecheck/build PASS + gateway connect smoke PASS (covers: S1, S2; depends: T1-T3)
