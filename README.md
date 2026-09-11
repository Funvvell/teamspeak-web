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

## 本地开发

```bash
npm install
npm run build
npm start
# 打开 http://127.0.0.1:8080
```

默认监听 **0.0.0.0:8080**（服务器部署）。本机只绑回环：

```bash
# Linux/macOS
HOST=127.0.0.1 npm start
# PowerShell
$env:HOST = "127.0.0.1"; npm start
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

## 服务器部署（任意浏览器访问网址）

### 要求

| 项 | 说明 |
|----|------|
| Node.js | 20+（推荐 22） |
| 防火墙 | 放行网关端口（默认 8080/TCP） |
| **HTTPS** | **公网必须**。浏览器在非 localhost 下拒绝麦克风权限（`getUserMedia` / WebCodecs） |
| 网络 | 服务器主机必须能访问目标 TeamSpeak 的 UDP（默认 9987） |

### 方式 A：Docker Compose（推荐）

```bash
git clone <your-repo-url>
cd teamspeak-web
docker compose up -d --build
# 浏览器访问 http://<服务器IP>:8080
```

数据（TS 身份）在 volume `tsweb-data`。

### 方式 B：源码 + systemd（Linux）

```bash
# 1. 部署到 /opt/teamspeak-web
sudo mkdir -p /opt/teamspeak-web
sudo rsync -a --exclude node_modules --exclude dist ./ /opt/teamspeak-web/
cd /opt/teamspeak-web
sudo npm ci
sudo npm run build

# 2. 安装服务
sudo cp deploy/teamspeak-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teamspeak-web
sudo systemctl status teamspeak-web
```

### 方式 C：只开防火墙（无 HTTPS，仅内网/试验）

```bash
npm run build
HOST=0.0.0.0 PORT=8080 npm start
# Ubuntu 示例
sudo ufw allow 8080/tcp
```

访问 `http://<IP>:8080` 可看界面、连服务器、文字聊天。  
**麦克风会失败**（非安全上下文）——要语音必须上 HTTPS。

### 反向代理 + HTTPS（生产必做）

1. 域名 A 记录指向服务器  
2. Nginx 反代本机 `8080`，并正确转发 WebSocket（`/ws` 的 `Upgrade`/`Connection`）  
3. Let's Encrypt 签发证书  

参考配置：`deploy/nginx.conf.example`  

关键片段：

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

用户访问 **https://teamspeak.example.com** 即可，任意浏览器都能开麦说话。

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8080` | HTTP/WS 端口 |
| `PROTOCOL` | `ts3` | `ts3` 真实协议 / `mock` 模拟 |

### 安全注意

- 当前**无登录体系**，任何能打开网址的人都能用网关连任意 TS 服务器。  
- 公网请：限制源 IP、加反代 Basic Auth / SSO，或仅内网开放。  
- 服务器密码只在内存中用于当次连接，不会写日志。

## 已实现

- 连接任意可达 TS3 服务器（UDP 握手、ECDH/RSA/EAX）
- **多开**：顶栏多服务器标签，`+` 新建；仅活动标签上行麦克风
- 频道树、成员列表、进出/换频道事件、指挥官 ★（服务器提供字段时）
- 频道 / 服务器 / **私聊**；**Poke**；**耳语目标**（客户端/频道，文本耳语）
- 成员**右键菜单**：私聊 / Poke / 耳语 / 复制昵称 / 快捷音量
- **按成员音量**（0–150%，按服务器记住）
- 麦克风自动识别 + 电平 + WebCodecs Opus 收发
- 身份每会话独立（多开不互踢）
- Mock 模式、Docker/反代部署说明

## 验证

```bash
npm run typecheck
npm run smoke:voice
npm run smoke:ts3 -- <ts-host> [port]
npm run smoke:ws
```

## WebSocket 契约（摘要）

客户端 → 网关：`connect` / `disconnect` / `join_channel` / `send_message` / `mic` / `whisper_add` / `whisper_clear` / `poke`  
网关 → 客户端：`status` / `server_info` / `channel_tree` / `client_list` / `message` / `error`  
Binary 帧：`[1][codec][clientId u16 BE][opus payload]`

完整类型见 `shared/types.ts`。

## 协议库

使用 [@honeybbq/teamspeak-client](https://www.npmjs.com/package/@honeybbq/teamspeak-client)（MIT，纯 TypeScript 客户端协议）。

其他参考实现：

- [ReSpeak/tsclientlib](https://github.com/ReSpeak/tsclientlib)（Rust）
- [Moepchi/webspeak3](https://github.com/Moepchi/webspeak3)
- [EchoSixHIYA/WebSpeak-client-for-TeamSpeak](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak)（AGPL-3.0）

## 免责声明

社区项目，与 TeamSpeak Systems GmbH 无关。商标归其权利人所有。
