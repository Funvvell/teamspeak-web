---
feature: voice-ux-pack
status: in-progress
updated: 2026-09-12
branch: master
commits: (pending)
---

# 语音体验包

## Report

## [S1] Problem

多开与基础语音已可用，但日常体验仍弱于 WebSpeak3：

1. 非活动服务器标签仍可能播出语音，干扰当前会话
2. 无法选择输出设备
3. 进出频道/私聊/Poke 无提示音
4. 断线后需手动点连接，易漏事件
5. 成员状态（Away/闭麦/耳聋）在树里几乎不可见

## [S2] Design

### 活动标签静音

- 网关 binary 帧已含 `clientId`；前端再在 **会话级** 打标
- 每标签独立 `GatewayClient`；`onAudioFrame` 闭包绑定 `tabId`
- 播放前检查：`tabId === activeIdRef.current` 才 `pushIncoming`；否则丢弃
- 切换标签后立即生效（无需重连）

### 输出设备（setSinkId）

- `enumerateDevices` 的 `audiooutput` 列表
- `AudioContext.setSinkId(deviceId)`（Chrome 110+）；不支持则隐藏并提示
- 选择写入 `localStorage` `tsweb:sinkId`
- `voice-pipeline.setOutputDevice(id)`

### 通知音效

- 内置短促 PCM beep（程序生成，无外部资源）
- 事件：
  - `clientEnter` / `clientLeave`（非自己）
  - `message` 且 `target` 为 `client:*`（私聊）
  - `*poke*` 文本
  - `status=connected` / `disconnected`
- 音量跟总音量；可开关 `tsweb:sounds`（默认开）
- 仅在对应标签为 **active** 时响（避免多开轰炸）

### 自动重连

- `status=disconnected` 或 WS `closed` 且该标签曾 `connected`：
  - 指数退避 1s → 2s → 4s → 最多 5 次
  - 顶栏标签显示「重连中 n/5」
  - 成功或用户手动断开则取消
- 使用缓存的 connect 参数（host/port/nick/password）

### 状态图标

从已有 `ClientInfo` 扩展（若协议字段缺失则不显示）：

```ts
interface ClientInfo {
  ...
  isAway?: boolean
  isInputMuted?: boolean
  isOutputMuted?: boolean
}
```

- `clientinfo` 探测（与 commander 同路径，限流）
- UI：Away 🌙、输入闭麦 🎤⛔、输出耳聋 🔊⛔
- 自己静音仍用顶栏「麦静音」；树内同步

## [S3] Out of Scope

- 真音频层 whisper 包
- 服务端事件日志面板（B 包）
- 网关鉴权 / 欢迎页（C 包）

## Tasks

- [x] T1: voice-pipeline 输出设备 setSinkId + 输出设备下拉 — acceptance: Chrome 可切换输出设备 (covers: S2)
- [x] T2: 活动标签才播放语音 — acceptance: onAudioFrame 绑定 tabId，非 active 丢弃 (covers: S2)
- [x] T3: 通知音效（进出/私聊/Poke/连接状态）— acceptance: 程序生成 beep，可关闭 (covers: S2)
- [x] T4: 断线自动重连（退避≤5次）— acceptance: disconnected/closed 触发 scheduleReconnect (covers: S2)
- [x] T5: Away/闭麦/耳聋图标 — acceptance: clientinfo 解析后频道树显示图标 (covers: S2)
- [x] T6: 验证 typecheck/build PASS + 网关 smoke PASS (~19s，含更多 clientinfo 探测) (covers: S1, S2; depends: T1-T5)
