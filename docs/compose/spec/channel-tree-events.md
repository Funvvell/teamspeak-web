---
feature: channel-tree-events
status: in-progress
updated: 2026-09-12
branch: master
commits: (pending)
---

# 频道树与事件日志

## Report

## [S1] Problem

频道树按 id 乱序、无法折叠；进出/移动只有提示音，没有可回看的事件流，信息密度低于 WebSpeak3。

## [S2] Design

### 频道排序

- `channellist` 提供 `channel_order`（同级排序）；无则回退 `id`
- 同父节点下按 `order` 升序，再按 `name`
- 根级与子级各自排序

### 折叠

- 前端 `collapsed: Set<channelId>`（`localStorage` `tsweb:collapsed`）
- 点击频道名旁 ▸/▾ 折叠；**点击加入频道不折叠**
- 折叠时隐藏子频道与子客户端列表（本频道客户端仍显示）

### 事件日志

- 右栏或左侧底部可切换「聊天 / 事件」
- 事件类型：`join` / `leave` / `move` / `connect` / `disconnect` / `poke`
- 来源：`clientEnter` / `clientLeave` / `clientMoved`（网关已有）需推到前端
- 网关新增 GatewayToClient：

```ts
{ type: 'event_log', event: 'join'|'leave'|'move'|'connect'|'disconnect'|'poke', clientId?: number, nickname?: string, channelId?: number, detail?: string, ts: number }
```

- 每标签保留最近 200 条；UI 单调列表，带时间与图标
- 仅 **active 标签** 可听通知音（已有）；事件列表始终写入对应标签

### 协议适配

- `ts3-adapter` 在 enter/leave/move 时 `emit({ type: 'event_log', ... })`
- `mock-adapter` 同步模拟
- 国旗：若 `clientinfo` 有 `client_country` 则显示 emoji 国旗映射（CN→🇨🇳 等）；失败不显示

## [S3] Out of Scope

- 文件传输、权限编辑
- 全局跨标签事件时间线

## Tasks

- [x] T1: 协议 event_log 消息 + adapter 发出 join/leave/move — smoke 收到 event_log (covers: S2)
- [x] T2: 频道 order 排序 + 折叠 UI/持久化 (covers: S2)
- [x] T3: 事件日志面板（聊天/事件切换）(covers: S2; depends: T1)
- [x] T4: 国家旗（可选字段）(covers: S2)
- [x] T5: typecheck/build PASS + 网关 smoke PASS (covers: S1, S2; depends: T1-T4)
