---
feature: archival-dispatch-ui
status: delivered
updated: 2026-09-14
branch: ui-archival-redesign
commits: 1b8fd4d..49ac2a5
---

# 档案调度台 UI 全面重设计

## Report

**What was built** — 将 TeamSpeak Web 从软圆角玻璃/暖奶油皮彻底改为「暖色纸质档案馆 / 电台值班调度台」：零圆角纸色 token、衬线标题 + 等宽元数据、朱砂/苔藓/赭石语义色。信息架构重排为左侧墨色语音 spine、报头页签、频道索引表、成员台账、电报式聊天栏与底部状态条；登录页改为非对称「接入调度单 + 值守清单封面」，连接中出现 OPENING 印章。

**Verification** — `npm run typecheck` PASS；`npm run lint` PASS；`npm run test:unit` 17/17 PASS；`npm run build` PASS。独立复审对照 spec 四条验收项均为 Met。

**Journey log** — (1) ui-ux-pro-max 首次 design-system 检索偏 OLED，二次查询 + style/color 域才对齐纸质方向。(2) 原 gateway tsconfig 将 `../shared/**/*` 全量纳入且无 `jsx`，是历史 typecheck 失败根因，已收窄为 types/utils。(3) 主 `tsc -p tsconfig.json` 单独可过、`npm run typecheck` 失败是因为第二段 gateway——排查时勿只看第一段。

## [S1] Problem

现有界面（提交态：暖奶油 + 朱红软圆角玻璃；工作区未提交：深色 Manuvrez；更早截图：浅蓝玻璃）与 TeamSpeak 客户端常见深色工具风同质化，且信息架构仍是「顶栏 + 三栏 + 底部语音条」。用户明确要求：**视觉与布局都必须与原来完全不同**，选定方向为「暖色纸质档案馆 / 电台值班档案」。

## [S2] Design

风格锚点：**1970 年代电台值班记录簿 + 邮电调度台 + 编辑网格**（e-ink-paper + editorial-grid + nature-distilled 融合，拒绝玻璃/蓝紫/软圆角）。

### Token

| 角色 | 值 |
|------|-----|
| paper | `#F4EFE3` |
| paper-raised | `#FBF7EE` |
| paper-deep | `#E8DFD0` |
| ink | `#1A1714` |
| ink-muted | `#5C5348` |
| kraft | `#3D3228` |
| vermillion | `#C23B1A` |
| amber | `#C4922A` |
| moss | `#2F6B45` |
| oxide | `#9B2F2F` |

几何：**radius 全 0**；边框 1px 实线；无玻璃 blur、无软阴影。

字体：Georgia/Songti SC 衬线标题；系统 sans 正文；Cascadia/Consolas 等宽编号与元数据。

### 布局（全新 IA）

```
┌─spine(72px 墨色)─┬─masthead 报头──────────────────────────┐
│ 印章麦克风        │ 档案号 · 连接页签 · 检索 · 设置          │
│ 垂直电平          ├─index──┬─register─────────┬─telex────┤
│ Deafen 印章      │ 频道索引│ 频道花名册        │ 电报聊天  │
└──────────────────┴────────┴───────────────────┴──────────┘
status-strip：MIC/VOX/OPUS/RTT/加密
```

登录：左调用单表单 + 右值守清单封面；连接中 OPENING 印章。

### Out of Scope

- 网关/语音协议、多主题、ChannelListView 过滤算法重写

## Tasks

- [x] T1: 重写 styles.css 为档案调度台 token + 新布局 (covers: S2)
- [x] T2: 更新 index.css / tailwind / shared UI 皮与 BlinkingSquares (covers: S2; depends: T1)
- [x] T3: 重排 App 登录与主界面 JSX (covers: S2; depends: T1)
- [x] T4: ChannelListView 序号索引呈现 (covers: S2; depends: T1)
- [x] T5: typecheck + lint + unit + build 全过 (covers: S1,S2; depends: T1-T4)
