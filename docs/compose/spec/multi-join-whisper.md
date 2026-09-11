---
feature: multi-join-whisper
status: in-progress
updated: 2026-09-12
branch: master
commits: (pending)
---

# 多开 + 耳语包

## Report

## [S1] Problem

现有客户端一次只能连一台 TeamSpeak 服务器，且缺少桌面客户端常见的多开与定向说话能力。参考 WebSpeak3（多服务器标签、右键/耳语/成员音量）与 WebSpeak（成员操作菜单），需要在现有 teamspeak-web 上增量支持：

1. 同时连接多台服务器（标签页），一键切换「当前活动连接」
2. 耳语目标（客户端/频道）与发送
3. 频道指挥官标记（若服务器提供相关字段）
4. 按成员调节收听音量

## [S2] Design

### 多开架构

- **每个服务器标签 = 一条独立 WebSocket `/ws`**（与 webspeak3 相同）
- 网关 `Session` 已按连接隔离，**不改网关多路复用**
- 前端 `ConnectionManager` 维护 `Map<tabId, ConnectionTab>`
- 仅 **active tab** 上行麦克风；非活动标签静音接收（音量 0）但仍保持协议在线（收消息/事件）
- 每标签独立 TS 身份（避免同 UID 互踢）

### 标签状态模型（前端）

```ts
interface ConnectionTab {
  id: string
  label: string
  host: string
  port: number
  nickname: string
  connState: ConnectionState
  serverName: string | null
  selfId: number | null
  channels: ChannelNode[]
  clients: ClientInfo[]
  messages: ChatMsg[]
  whisperTargets: number[]   // clid 列表
  whisperChannelId: number | null
  muted: boolean             // 关本标签麦克风
  clientRef: GatewayClient
}
```

### 协议扩展（shared + gateway）

```ts
// Client → Gateway
{ type: 'whisper_add', target: { kind: 'client'; id: number } | { kind: 'channel'; id: number } }
{ type: 'whisper_clear' }
{ type: 'send_message', target: ... }  // 已有；PM target={client:n} 保留

// Gateway → Client
// ClientInfo 增加:
//   isCommander?: boolean
//   volumeHint?: number  // 可选，服务端无则前端本地存
```

### 耳语实现策略

TS3 音频耳语是语音包标志位；`@honeybbq/teamspeak-client@0.2.3` 的 `sendVoice` 未暴露 whisper 标志。

**本轮实现：**

1. **UI 耳语目标**：右键「加入耳语目标 / 清空耳语」
2. **文本耳语**：对目标 `sendTextMessage(targetMode=1)`，消息前缀 `[耳语]`
3. **语音耳语**：若库后续支持则接入；当前在 `ts3-adapter` 中尝试 `execCommand` 无标准命令时不阻塞
4. 发送时若存在耳语目标，**频道消息仅发给耳语列表**（PM），并在 UI 标明「耳语中」

### 指挥官

- 从 `clientinfo` / `channellist` 读取 `client_channel_commander` 或 `channel_flag_...`（字段名随服而异）
- 解析成功则 `ClientInfo.isCommander = true`，频道树显示 ★
- 字段缺失时静默忽略

### 成员音量（前端）

- `voice-pipeline` 按 `clientId` 维护 `GainNode` 图（或 PCM 后增益）
- UI：成员行右键/滑条 → `0–200%`
- 持久化：`localStorage` key `tsweb:volumes:<host>` 按昵称或 clid 存

### 右键菜单

| 动作 | 行为 |
|------|------|
| 私聊 | 切到 PM 目标并聚焦输入框 |
| Poke | `poke` 命令 |
| 加入耳语 / 移除耳语 | 更新 `whisperTargets` |
| 设为指挥官显示 | 只读标记 |
| 复制昵称 | clipboard |
| 音量 0/50/100/150 | 快捷音量 |

### 连接管理

- 「+ 新建连接」打开表单（复用现有连接字段）
- 标签条：服务器名 + 状态点 + 关闭按钮
- 活动标签变更时：切换 UI 数据源；麦克风 `sendAudio` 只发到 active `clientRef`
- 关闭标签：`disconnect` + 释放 pipeline 引用（若共享 AudioContext，仅切 mute）

## [S3] Out of Scope

- 音频层真正 TS whisper 包标志（库未暴露）
- 管理后台 / 邀请链接 / 中继（WebSpeak 运维向）
- WebRTC 双路径、伴奏共享
- TeaSpeak/GreenTeaSpeak

## Tasks

- [x] T1: 协议类型扩展 — whisper 指令与 ClientInfo.isCommander；web/gateway 共用 (covers: S2)
- [x] T2: Gateway whisper/poke/commander 适配 — ts3-adapter 支持 whisper_add/clear、PM 前缀、clientinfo 指挥官解析 (covers: S2; depends: T1)
- [x] T3: 前端 ConnectionManager 多标签 — 独立 WS/标签、活动切换、仅 active 上行麦克风 (covers: S2; depends: T1)
- [x] T4: 成员右键菜单 + 私聊/Poke/耳语目标 — (covers: S2; depends: T3)
- [x] T5: 按成员音量 — voice-pipeline per-client gain + UI 滑条 + localStorage (covers: S2; depends: T3)
- [x] T6: 频道树指挥官图标与耳语状态条 — (covers: S2; depends: T2, T4)
- [x] T7: 验证 — typecheck/build PASS；gateway 连 ts.example.com PASS (~6s) (covers: S1, S2; depends: T1-T6)
