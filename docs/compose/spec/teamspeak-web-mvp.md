---
feature: teamspeak-web-mvp
status: in-progress
updated: 2026-09-12
branch: master
commits: (pending)
---

# TeamSpeak Web MVP

## Report

(待交付时填写)

## [S1] Problem

浏览器无法直接实现 TeamSpeak 3 语音客户端：

1. TS3 语音走 **UDP**，浏览器没有 raw UDP socket 能力。
2. TS3 协议是专有的加密/压缩协议栈（RSA 握手、包序、Opus 编解码），不是 WebRTC。

因此「网页端 TeamSpeak」必须包含一个 **服务端网关**：浏览器 ↔ WebSocket ↔ 网关 ↔ TS 协议 ↔ TS 服务器。

用户需要一个能在浏览器里：输入任意可达 TS3 服务器地址、浏览频道树、收发语音、文字聊天的 MVP。

## [S2] Design

### 架构

```
Browser (Vite + React + TS)
    │  WebSocket (JSON control + binary audio frames)
    ▼
Gateway (Node.js + TypeScript)
    │  team-speak-protocol / ts3client 等 Node 库
    ▼
TeamSpeak 3 Server (UDP 9987 default)
```

### 模块划分

| 模块 | 职责 |
|------|------|
| `web/` | 连接表单、频道树、聊天、音量/麦克风控制、状态栏 |
| `gateway/` | 静态托管 web/dist、`/ws` WebSocket、每连接一个 TS 会话 |
| 协议层 | 网关内封装：连接、登录、频道列表、移动、文本、语音帧 |

### WebSocket 消息契约

控制消息为 JSON 文本帧：

```ts
// Client → Gateway
{ type: 'connect', host: string, port: number, nickname: string, password?: string }
{ type: 'disconnect' }
{ type: 'join_channel', channelId: number }
{ type: 'send_message', target: 'channel' | 'server' | { client: number }, text: string }
{ type: 'mic', enabled: boolean }

// Gateway → Client
{ type: 'status', state: 'connecting'|'connected'|'disconnected'|'error', message?: string }
{ type: 'server_info', name: string, welcome: string }
{ type: 'channel_tree', channels: ChannelNode[] }
{ type: 'client_list', clients: ClientInfo[] }
{ type: 'message', from: string, target: string, text: string, ts: number }
{ type: 'error', code: string, message: string }
```

语音帧为 Binary WebSocket frame（Opus 或 PCM，网关负责与 TS 编解码转换）。

### 频道树模型

```ts
interface ChannelNode {
  id: number
  name: string
  parentId: number | null
  maxClients: number
  isDefault: boolean
  clients: ClientInfo[]
}

interface ClientInfo {
  id: number
  nickname: string
  channelId: number
  isTalking: boolean
  isMuted: boolean
}
```

### 错误与边界

- 连接失败 / 认证失败 / 服务器不可达：WebSocket 回 `status=error` + message，前端展示，不崩溃。
- 网关进程与浏览器断开：清理对应 TS 会话，避免僵尸连接。
- 麦克风权限拒绝：UI 提示，仍可收听（若后端支持只收不发）。
- 默认端口 9987；缺省时由前端填 9987。

### 协议库选型（决策记录）

| 候选 | 语言 | 备注 |
|------|------|------|
| ReSpeak/tsclientlib | Rust | 最完整；需额外 Rust 进程与 JSON 桥 |
| teamspeak-js 及其 fork | Node | 可直接放网关内；社区维护程度需评估 |
| 自研协议 | — | 工作量过大，MVP 不做 |

**MVP 决策**：优先评估 npm 上可用的 Node TS3 客户端库（如 `ts3-nodejs-library` / 相关 fork）；若语音支持不足，则：
1. 控制面（连接/频道/聊天）用 Node 库；
2. 语音面第二阶段接入 `tsclientlib` 独立进程或 Opus 编解码桥。

若 MVP 阶段无法在本机完成真实协议对接，交付「可运行的 UI + 网关骨架 + mock 协议适配层」，接口与消息契约按本设计锁定，真实协议替换只改 `gateway/src/protocol/`。

### 语音路径（MVP 目标）

1. 浏览器 `getUserMedia` 采集麦克风。
2. AudioWorklet / ScriptProcessor 产出 Opus 或 PCM 帧。
3. Binary WS 发到网关。
4. 网关编码并注入 TS 语音管道；回放路径反向到浏览器 `AudioContext`。

MVP 可接受：先完成控制面 + 文字聊天 + 麦克风权限与设备选择 UI；语音收发在协议库能力具备时闭环。

### 安全

- 网关默认只绑 `127.0.0.1`（本地开发）。
- 不在日志中打印服务器密码。
- 不实现公网暴露的认证系统（Out of Scope）。

## [S3] Out of Scope

- 公网多用户部署、账号体系、HTTPS/反代配置
- ServerQuery 管理后台（踢人/改权限）
- Whisper、频道指挥官、文件传输
- TS6 专属 Stream/Call 协议、屏幕共享
- TeaSpeak/GreenTeaSpeak 兼容
- 原生桌面打包（Electron）

## Tasks

- [x] T1:  monorepo 骨架 — acceptance: 根目录 `index.html` + `src/` + `gateway/`；`npm run build` + `npm start` 在 8080 提供静态页与 `/ws` (covers: S2)
- [x] T2: WebSocket 消息契约与类型定义 — acceptance: `shared/types.ts` 导出 connect/status/channel_tree 等消息类型，web 与 gateway 共用 (covers: S2)
- [x] T3: Gateway 会话管理与 mock 协议适配 — acceptance: 客户端 connect 后收到 mock 频道树与假成员，可 join_channel / send_message 回显 (covers: S2; depends: T1, T2)
- [ ] T4: 真实 TS3 协议适配（Node 库） — acceptance: 对任意可达 TS3 服务器完成连接、频道树同步、频道文字聊天 (covers: S2; depends: T3)
- [x] T5: Web UI — 连接表单/频道树/聊天/状态 — acceptance: 浏览器打开 index.html 入口（或 Vite 预览），完成连接→树刷新→聊天闭环 (covers: S2; depends: T2)
- [x] T6: 麦克风与输出设备 — acceptance: 可选设备、开闭麦、本地电平指示；权限拒绝有提示 (covers: S2; depends: T5)
- [ ] T7: 语音帧通路 — acceptance: 网关与浏览器间 binary WS 传音频帧；若协议库支持则接入 TS，否则标记为 protocol adapter 接口完成 (covers: S2; depends: T4, T6)
- [x] T8: 验证与文档 — acceptance: `npm test`（typecheck）通过；README 写清启动步骤与架构图 (covers: S1, S2; depends: T1-T7)
