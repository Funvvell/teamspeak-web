---
feature: ops-security-pack
status: delivered
updated: 2026-09-12
branch: master
commits: e15a2e6~1..afe2184 (+ review fixes)
---

# 运维安全包

## Report

**What was built** — 可选 `GATEWAY_TOKEN`（WS upgrade 校验 URL token 或 Bearer）；`/health`、`/config`；前端 token 存储与默认服务器预填。

**Verification** — /health /config JSON PASS；带 token 的 WS 路径由前端自动附带；无 token 时本地开发不受影响。

**Journey log** — 首版注释与实现不一致，已对齐为 upgrade 阶段 401。

## [S1] Problem

公网部署无鉴权，任何人可滥用网关连任意 TS 服务器；无默认服务器配置与健康检查。

## [S2] Design

### 网关 Token

- 环境变量 `GATEWAY_TOKEN`（空 = 不校验，兼容本地开发）
- 校验方式（在 WebSocket **upgrade 阶段**）：
  - URL：`/ws?token=<token>`
  - 或 HTTP Header：`Authorization: Bearer <token>`
- 失败：HTTP 401 并关闭连接
- 前端：`localStorage tsweb:token`；设置里可填；连接时带在 query 上
- 注：不做首条 JSON 鉴权（升级前即拒绝，避免未鉴权占会话）

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
