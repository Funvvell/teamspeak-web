# TeamSpeak Web

浏览器里的 TeamSpeak 客户端 MVP：通过本地 **WebSocket 网关** 桥接真实的 TS 协议栈。

## 为什么需要网关？

浏览器无法直接使用 TeamSpeak 3 的 **UDP + 专有加密协议**。因此架构固定为：

```
Browser (Vite + React + TS)
    │  WebSocket（JSON 控制消息 + Binary 音频帧）
    ▼
Gateway (Node.js + TypeScript, ws)
    │  协议适配层（当前：Mock；下一阶段：真实 TS3 库）
    ▼
TeamSpeak 3 Server (UDP, 默认 9987)
```

## 目录

| 路径 | 说明 |
|------|------|
| `index.html` | 前端入口（Vite） |
| `src/` | React UI：连接表单、频道树、聊天、麦克风 |
| `gateway/` | Node 网关：静态托管 + `/ws` + Session |
| `gateway/src/protocol/` | 协议适配器（`adapter.ts` 接口 / `mock-adapter.ts`） |
| `shared/types.ts` | WebSocket 消息契约 |
| `docs/compose/spec/` | 设计规格 |

## 快速开始

```bash
npm install
npm run build
npm start
# 打开 http://127.0.0.1:8080
```

开发热更新（两个进程）：

```bash
npm run dev
# Vite: http://localhost:5173  （已代理 /ws → 127.0.0.1:8080）
# Gateway: ws://127.0.0.1:8080/ws
```

## 当前状态（MVP）

- 已实现：连接表单、频道树、频道/服务器文字聊天、麦克风设备选择与电平、状态栏
- 协议层：`MockProtocolAdapter`（可完整跑通 UI 与消息契约）
- 待接入：真实 TS3 协议库（见规格 T4/T7）；接入时只替换 `gateway/src/protocol/` 实现

## WebSocket 契约（摘要）

客户端 → 网关：`connect` / `disconnect` / `join_channel` / `send_message` / `mic`  
网关 → 客户端：`status` / `server_info` / `channel_tree` / `client_list` / `message` / `error`

完整类型见 `shared/types.ts`。

## 替换为真实 TS3 协议

实现 `TsProtocolAdapter`（`gateway/src/protocol/adapter.ts`），在 `gateway/src/index.ts` 里把 `createMockAdapter` 换成真实实现即可。可选参考：

- [ReSpeak/tsclientlib](https://github.com/ReSpeak/tsclientlib)（Rust，最完整）
- [Moepchi/webspeak3](https://github.com/Moepchi/webspeak3)（React + Node 网关 + Rust connector）
- [EchoSixHIYA/WebSpeak-client-for-TeamSpeak](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak)（Vue + Node，AGPL-3.0）

## 免责声明

社区项目，与 TeamSpeak Systems GmbH 无关。商标归其权利人所有。
