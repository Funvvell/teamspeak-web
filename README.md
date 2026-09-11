# TeamSpeak Web

浏览器里的 TeamSpeak 客户端：通过本地 **WebSocket 网关** 桥接真实的 TS3 协议栈。

## 为什么需要网关？

浏览器无法直接使用 TeamSpeak 3 的 **UDP + 专有加密协议**。因此架构固定为：

```
Browser (Vite + React + TS)
    │  WebSocket（JSON 控制消息 + Binary 音频帧）
    ▼
Gateway (Node.js + TypeScript, ws)
    │  @honeybbq/teamspeak-client（真实 TS3 客户端协议）
    ▼
TeamSpeak 3 Server (UDP, 默认 9987)
```

## 目录

| 路径 | 说明 |
|------|------|
| `index.html` | 前端入口（Vite） |
| `src/` | React UI：连接表单、频道树、聊天、麦克风 |
| `gateway/` | Node 网关：静态托管 + `/ws` + Session |
| `gateway/src/protocol/ts3-adapter.ts` | 真实 TS3 协议适配器 |
| `gateway/src/protocol/mock-adapter.ts` | 开发用 Mock（`PROTOCOL=mock`） |
| `shared/types.ts` | WebSocket 消息契约 |
| `docs/compose/spec/` | 设计规格 |

## 快速开始

```bash
npm install
npm run build
npm start
# 打开 http://127.0.0.1:8080
```

默认协议为 **真实 TS3**（`PROTOCOL=ts3`）。要用 Mock：

```bash
# PowerShell
$env:PROTOCOL = "mock"
npm start
```

开发热更新：

```bash
npm run dev
# Vite: http://localhost:5173  （已代理 /ws → 127.0.0.1:8080）
# Gateway: ws://127.0.0.1:8080/ws
```

## 已实现

- 连接任意可达 TS3 服务器（UDP 握手、ECDH/RSA/EAX）
- 频道树、成员列表、进出/换频道事件
- 频道 / 服务器文字聊天、Poke 提示
- 麦克风设备选择与电平（本地）
- **语音收发**：WebCodecs Opus 编码上行 / 解码播放（Chrome/Edge；需 HTTPS 或 localhost）
- 输出音量滑条
- 身份持久化：`gateway/data/identity.txt`
- Mock 模式便于无服务器调试 UI（含语音回声）

## 验证

```bash
npm run typecheck
npm run smoke:voice
npm run smoke:ts3 -- <ts-host> [port]   # 真实协议
# 另开终端：
PROTOCOL=mock npm start
npm run smoke:ws                        # WS 控制面
```

## WebSocket 契约（摘要）

客户端 → 网关：`connect` / `disconnect` / `join_channel` / `send_message` / `mic`  
网关 → 客户端：`status` / `server_info` / `channel_tree` / `client_list` / `message` / `error`  
Binary 帧：`[opcode=1][codec:u8][opus payload]`（codec 4 = Opus Voice）

完整类型见 `shared/types.ts`。

## 协议库

使用 [@honeybbq/teamspeak-client](https://www.npmjs.com/package/@honeybbq/teamspeak-client)（MIT，纯 TypeScript 客户端协议）。

其他参考实现：

- [ReSpeak/tsclientlib](https://github.com/ReSpeak/tsclientlib)（Rust）
- [Moepchi/webspeak3](https://github.com/Moepchi/webspeak3)
- [EchoSixHIYA/WebSpeak-client-for-TeamSpeak](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak)（AGPL-3.0）

## 免责声明

社区项目，与 TeamSpeak Systems GmbH 无关。商标归其权利人所有。
