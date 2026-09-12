---
feature: voice-deep-ptt-vox
status: delivered
updated: 2026-09-12
branch: master
commits: 6685d6f
---

# 语音深水：PTT / VOX

## Report

## [S1] Problem

开麦后一直上行，费带宽且易误传环境音。桌面客户端常见 PTT（按键说话）与 VOX（声控）。

真音频层 TS whisper 依赖协议库暴露 whisper 包标志，当前 `@honeybbq/teamspeak-client` 未提供；本轮不做假语音耳语，专注 **门限发送**。

## [S2] Design

### 发送门限

在 `mic.ts` 编码回调前判断：

```
mode: 'open' | 'vox' | 'ptt'
voxThreshold: 0–1（默认 0.08）
pttKey: 默认 ' '`（空格）
pttHeld: boolean
```

- **open**：与现在相同，有帧就发
- **vox**：电平（已有 analyser RMS）> threshold 且最近 200ms 内曾超过，才 `onOpusFrame`
- **ptt**：仅 `pttHeld` 时发送；keydown/keyup 绑定，避免在输入框触发

### UI

- 模式单选：常开 / 声控 VOX / 按键 PTT
- VOX：阈值滑条 + 实时电平与阈值线
- PTT：按键捕获框（按下一键记录）；提示「按住 空格 说话」
- 设置持久化：`tsweb:vox` = `{ mode, threshold, pttKey }`

### 指示

- 状态：`未采集 / 空闲 / 说话中(VOX) / 按住说话(PTT)`
- 说话中电平条高亮（accent）

## [S3] Out of Scope

- 协议层 whisper 包
- 独立 VOX 延迟/保持时间高级曲线

## Tasks

- [x] T1: mic 门限模式 open/vox/ptt + 持久化 — startCapture 回调前 shouldSend (covers: S2)
- [x] T2: UI 控件与提示 — 模式/阈值/按键捕获 (covers: S2; depends: T1)
- [x] T3: typecheck/build PASS (covers: S1, S2; depends: T1-T2)
