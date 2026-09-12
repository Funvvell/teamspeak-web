---
feature: double-click-ns
status: designed
updated: 2026-09-12
branch: master
commits: (pending)
---

# 双击切频道 + 麦克风降噪

## Report

## [S1] Problem

1. 单击频道即切换，易误触；应双击才切换（单击可展开/选中）。
2. 环境噪声仍进上行，需可开关的 RNNoise 降噪。

## [S2] Design

### 双击切换

- `channel-head` 的 `onClick` 不再 `onJoin`
- `onDoubleClick` → `onJoin(channelId)`
- 单击：若有子频道则 toggle 折叠（或仅高亮）
- 提示文案：「双击加入频道」

### 降噪（开源）

调研 npm：

| 包 | 特点 |
|----|------|
| **simple-rnnoise-wasm** | MIT，AudioWorklet + WASM，Web 优先（**采用**） |
| @jitsi/rnnoise-wasm | Jitsi 在用，API 偏底层 |
| @timephy/rnnoise-wasm | 前端 WASM，需自接 Worklet |
| 浏览器 `noiseSuppression` | 已开启，效果弱于 RNNoise |

链路：`getUserMedia` → `RNNoiseNode`（若启用）→ capture worklet → Opus。

开关：`localStorage tsweb:ns` 默认 **开**；失败自动回退浏览器 NS only。

## [S3] Out of Scope

- DeepFilterNet 等更重模型
- 网关侧 DSP

## Tasks

- [ ] T1: 频道双击加入 / 单击折叠 — (covers: S2)
- [ ] T2: 接入 simple-rnnoise-wasm 开关 — (covers: S2)
- [ ] T3: typecheck/build + 冒烟 — (covers: S1, S2; depends: T1-T2)
