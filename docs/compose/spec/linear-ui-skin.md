---
feature: linear-ui-skin
status: delivered
updated: 2026-09-12
branch: master
commits: 92492b7
---

# Linear 风格 UI（WebSpeak 布局）

## Report

## [S1] Problem

现有深色蓝工具风可用但偏通用；需按用户选定的 **Linear.app** 设计语言刷新视觉，同时保持 WebSpeak 式三栏交互（连接 / 频道树 / 聊天）。

## [S2] Design

模式：**convention mode**（VoIP 工具）— 不改信息架构，只换 token 与组件皮。

### Token（来自 design-md/linear.app）

| 角色 | 值 |
|------|-----|
| canvas | `#010102` |
| surface-1 | `#0f1011` |
| surface-2 | `#141516` |
| surface-3 | `#18191a` |
| hairline | `#23252a` |
| hairline-strong | `#34343a` |
| primary | `#5e6ad2` |
| primary-hover | `#828fff` |
| ink | `#f7f8f8` |
| ink-muted | `#d0d6e0` |
| ink-subtle | `#8a8f98` |
| ink-tertiary | `#62666d` |
| success | `#27a644` |
| talk | `#3dd68c`（语义绿，仅说话点） |
| err | `#e5484d` |

### 字体

- UI：`"SF Pro Display", "SF Pro Text", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`
- 小标题：weight 500–600，负字距 `-0.01em ~ -0.02em`
- 区段标签：11–12px，uppercase，letter-spacing 0.06em，ink-subtle

### 布局（保持）

```
[ topbar: brand · tabs · status ]
[ left 300 | center tree | right chat/events ]
```

Linear 化：无渐变大光斑；面板炭灰 + 1px hairline；圆角 8px；按钮扁平 surface-3 + primary 实心仅用于「连接」。

### 签名

- **顶栏极细 1px 底边 + 薰衣草蓝「说话中」呼吸点**
- 频道行 active：左侧 2px primary 竖条（Linear list 焦点感）

## [S3] Out of Scope

- 改业务逻辑 / 协议
- 多主题切换（可后续加 light）

## Tasks

- [x] T1: styles.css 全量 Linear token 重写 (covers: S2)
- [x] T2: 沿用现有 App 类名，无强制改 JSX (covers: S2; depends: T1)
- [x] T3: typecheck/build PASS (covers: S1, S2; depends: T1-T2)
