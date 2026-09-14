---
feature: archival-dispatch-ui
status: designed
updated: 2026-09-12
branch: ui-archival-redesign
commits: 
---

# 档案调度台 UI 全面重设计

## Report

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
| ink-faint | `#8A7F70` |
| kraft | `#3D3228` |
| kraft-soft | `#524536` |
| vermillion | `#C23B1A` |
| amber | `#C4922A` |
| moss | `#2F6B45` |
| oxide | `#9B2F2F` |
| rule | `#1A171422` |
| rule-strong | `#1A171455` |

几何：**radius 全 0**；边框 1px 实线；无玻璃 blur、无软阴影；焦点 `2px solid vermillion`。

字体：
- 显示/标题：`Georgia, 'Times New Roman', 'Songti SC', serif`（档案封面感）
- 正文 UI：系统 sans
- 眉题/编号/时间戳：`ui-monospace, 'Cascadia Mono', Consolas, monospace`

### 布局（全新 IA）

```
┌─spine(72px 墨色)─┬─masthead 报头双线──────────────────────┐
│ 印章麦克风        │ 档案号 · 连接页签 · 检索 · 设置          │
│ 水平电平          ├─index──┬─register─────────┬─telex────┤
│ Deafen 印章      │ 频道索引│ 频道花名册/成员台账│ 电报聊天  │
│ 垂直档案名        │ 编号+行│ 行式台账          │ 时间戳日志│
└──────────────────┴────────┴───────────────────┴──────────┘
status-strip 细条：编码/延迟/加密
```

- **spine**：左侧固定墨色竖条——主麦克风大印章按钮、垂直电平、Deafen、昵称缩写。取代原「底部语音条」主控地位。
- **masthead**：双细线报头（3px + 1px），等宽档案号，无圆角图标钮。
- **index**：频道为「索引登记表」——序号 `01` + 名称 + 容量，active 左侧 3px 朱砂条。
- **register**：频道成员为「台账行」，说话=行底 moss 淡染 + 印章点。
- **telex**：右侧电报式聊天/事件日志（非底部大聊天区）。
- **status-strip**：底部 28px 细条，仅元数据。
- **登录**：非对称——左 55%「调用单」表单（直角、印章角标），右 45%「档案封面」功能索引；废弃居中卡片。

### 签名 moment

1. 连接中：表单盖「OPENING」旋转虚线章  
2. 说话中：spine 麦克风印章 + register 行 moss 淡染同步  
3. 频道 active：朱砂 3px 左条 + 序号高亮  

### 实现边界

- 保留全部业务逻辑、事件、快捷键、移动端 `mobile-tabbar`（`tree|voice|chat`）。
- 重写 `src/styles.css`、更新 `src/index.css` tokens、`tailwind.config.js` 色/圆角、shared Button/Input 皮。
- 重排 `App.tsx` 中 `renderLogin` / `renderMain` 的 JSX 结构为 spine+masthead+三列+status-strip。
- `ChannelListView` 增序号呈现类名，不改树逻辑。
- `design.md` 反主流约束：禁蓝紫渐变、禁 ease-in-out、禁 emoji 图标、禁完美居中登录——全部满足。

## [S3] Out of Scope

- 网关/语音协议  
- 多主题切换  
- 重写 ChannelListView 过滤算法  
- E2E/真实 TS3 联调  

## Tasks

- [ ] T1: 重写 styles.css 为档案调度台 token + 新布局（covers: S2）
- [ ] T2: 更新 index.css / tailwind / shared UI 皮与 BlinkingSquares 纸纹（covers: S2; depends: T1）
- [ ] T3: 重排 App 登录与主界面 JSX 为 spine/masthead/register/telex（covers: S2; depends: T1）
- [ ] T4: ChannelListView 序号索引呈现（covers: S2; depends: T1）
- [ ] T5: typecheck + lint + unit + build 全过（covers: S1,S2; depends: T1-T4）
