---
feature: tactical-backend-binding
status: delivered
updated: 2026-09-15
branch: feat/tactical-backend
commits: c30b6f0..<uncommitted>
---

# Tactical UI 后端绑定（权限 / 目录 / 遥测 / 耳语）

## Report

**What was built** — 战术 UI 与网关打通：新增 `shared/types` 权限/目录/遥测协议；网关侧 `serverquery.ts`（薄 TCP + mock 同构）、`catalog.ts` 书签持久化、Session 路由（permission_snapshot/apply、channel_update、catalog_*、whisper_sync）；`/api/catalog` HTTP；权限页/服务器目录/成员遥测/耳语同步由真实 WS 数据驱动，布局未改。

**Verification** — `tsc` app+gateway PASS；`eslint` PASS；`vitest` 59/59 PASS；`vite build` PASS；mock WS 冒烟：connect → catalog(3 bookmarks) → permission_snapshot(6 tiers, mock SQ) PASS。

**Journey log** — 工作区已有半成品绑定代码，本次对齐 `CatalogPayload` 协议形状与类型缺口并清 lint；`/api/catalog` 移到 token 校验之后。

## [S1] Problem

战术深色 UI 已可运行，但权限页/目录/遥测/耳语多为静态演示，未接入网关与 TS3 ServerQuery。

## [S2] Design

### 目标原则

- **前端视觉保持不变**：不改布局与交互结构；仅做**数据绑定**（静态演示值 → 真实数据；按钮触发真实网关指令）。
- **密钥不进浏览器**：ServerQuery 用户/密码只存在网关环境变量。
- **Mock 可完整走通**：`PROTOCOL=mock` 时权限/目录/遥测均有可演示数据，便于开发与 CI。
- **向后兼容**：现有 `ClientToGateway` / `GatewayToClient` 消息保持可用；新能力用**增量 type** 扩展。

### 架构

```
Browser (tactical UI)
   │  /ws  JSON + Binary voice  （现有）
   ▼
Node Gateway
   ├─ VoiceClientAdapter (9987 UDP)   — 连接/频道/聊天/语音（已有）
   ├─ ServerQueryClient (10011 TCP)   — 权限/频道属性/服务器组（新增，按会话按需连接）
   ├─ CatalogStore                    — 书签/最近连接（新增，JSON 文件）
   └─ /config /api/catalog            — 目录只读配置（扩展）
```

### 1. 协议扩展（`shared/types.ts`）

在现有 union 上**新增**消息类型，不删除旧消息。

#### 1.1 客户端 → 网关（权限 / 服务器目录 / 耳语同步）

| type | 载荷 | 说明 |
|------|------|------|
| `serverquery_connect` | `{ host, queryPort, username, password, serverId? }` | 建立管理连接；成功后 `serverquery_status` |
| `serverquery_disconnect` | `{}` | 断开管理连接 |
| `permission_snapshot` | `{ channelId? }` | 拉取：安全上下文列表、权限树、指定频道检查器、审计尾部 |
| `permission_apply` | `{ tierId, changes: PermChange[] }` | 应用勾选变更（`key` + `enabled` / `value`） |
| `channel_update` | `{ channelId, patch: ChannelPatch }` | 频道检查器保存（名称、描述、最大人数、持久化、码率、密码开关） |
| `catalog_list` | `{}` | 拉取书签 + 最近连接 |
| `catalog_add_bookmark` | `{ name, host, port, nickname? }` | 新增书签 |
| `catalog_remove_bookmark` | `{ id }` | 删除书签 |
| `whisper_sync` | `{ clients: number[], channels: number[] }` | 将音频设置页耳语列表同步到语音适配器 |

`PermChange` / `ChannelPatch`：见 `shared/types.ts`。

#### 1.2 网关 → 客户端

| type | 载荷 | 说明 |
|------|------|------|
| `serverquery_status` | `{ connected, serverVersion?, error? }` | 管理连接状态 |
| `permission_snapshot` | `{ snapshot: PermissionSnapshot }` | 权限页完整快照 |
| `permission_apply_ok` | `{ tierId, applied }` | 应用成功 |
| `catalog` | `{ catalog: CatalogPayload }` | 目录数据 `{ bookmarks, recent }` |
| `client_list` / `channel_tree` | 扩展字段 | 遥测补全时重发 |

#### 1.3 扩展实体

见 `shared/types.ts`：`ClientInfo.packetLoss/positionDeg/isPrioritySpeaker`、`ChannelNode` meta、`SecurityTier`、`PermissionSnapshot`、`Bookmark`、`CatalogPayload` 等。

前端映射（**不改视觉结构，只替换数据源**）：

- 权限页 → `permission_snapshot`；提交 → `permission_apply`；频道保存 → `channel_update`
- 服务器目录 → `catalog`；连接成功写入 recent
- 主界面成员卡丢包/3D/优先发言 → 扩展 `ClientInfo`
- 音频页耳语 → `whisper_sync`

### 2. ServerQuery 客户端（网关）

- 自研薄 TCP ServerQuery（`gateway/src/serverquery.ts`）；mock 用 `createMockServerQuery()` 同构。
- 凭据仅 env：`SQ_HOST` / `SQ_PORT` / `SQ_USERNAME` / `SQ_PASSWORD` / `SQ_SERVER_ID` / `PERMISSIONS_ENABLED`。
- 权限键白名单与 UI 对齐；审计为网关本地环形缓冲（≤50）。

### 3. 服务器目录与书签

- `gateway/src/catalog.ts` → `gateway/data/catalog.json`（`CATALOG_PATH` 可覆盖）
- WS `catalog_list` / add / remove；HTTP `GET /api/catalog`（有 `GATEWAY_TOKEN` 时需鉴权）
- 首次无文件时播种 3 条书签

### 4. 主界面遥测补全

- mock：客户端稳定伪数据（packetLoss / positionDeg / priority）
- ts3 adapter：尽力抽取扩展字段；无数据省略

### 5. 音频设置页绑定

- 耳语列表变更 → `whisper_sync`
- 检测模式/AEC/AGC 仍为本地 WebAudio

### 6. 环境变量

见 `.env.example`（SQ_*、CATALOG_PATH、PERMISSIONS_ENABLED）。

### 7. 安全

- ServerQuery 凭据不进 `/config` 或 WS 回显
- 权限写仅在 `serverquery_status.connected` 时执行
- voice host 白名单策略沿用；SQ connect 同样 `assertHostAllowed`（非 mock）

### 8. 参考实现（开源）

- TeamSpeak 3 ServerQuery Manual；`ts3-nodejs-library`（选型时参考，最终为薄客户端自研）
- `@honeybbq/teamspeak-client`（语音 UDP，已有）

### 9. 测试边界

- 单测：catalog 持久化、mock SQ snapshot/apply、既有 session
- 冒烟：mock WS catalog + permission_snapshot 往返

## [S3] Out of Scope

- 改动战术 UI 布局与视觉 token
- 浏览器端直接 TCP ServerQuery
- 公网第三方服务器发现 / 真实中继健康
- 完整 ban 管理、服务器创建向导
- 浏览器全局系统热键
- 多虚拟服务器并行权限管理 UI
- 音频编解码改动

## Tasks

- [x] T1: 扩展 `shared/types.ts` — acceptance: typecheck 通过 (covers: S2.1)
- [x] T2: 网关 ServerQuery + mock 同构 — acceptance: mock 权限快照单测通过 (covers: S2.2; depends: T1)
- [x] T3: Session 路由新消息 — acceptance: mock WS 冒烟 + 既有 session 测试 (covers: S2.1–2.4; depends: T1, T2)
- [x] T4: CatalogStore + `/api/catalog` — acceptance: 单测增删书签 (covers: S2.3; depends: T1)
- [x] T5: TS3 adapter 遥测字段 — acceptance: 有数据时出现，无则省略 (covers: S2.4; depends: T1)
- [x] T6: mock 演示数据对齐 UI — acceptance: 连接后权限/目录/遥测非空 (covers: S2.2–2.4; depends: T1)
- [x] T7: 前端权限/目录/成员/耳语绑定 — acceptance: WS 驱动，布局不变 (covers: S2.1–2.4; depends: T1–T6)
- [x] T8: `.env.example` + README — acceptance: 文档含 SQ_* / CATALOG_* (covers: S2.6)
- [x] T9: typecheck / lint / unit / build + mock WS 冒烟 — acceptance: 全 PASS (covers: S1, S2; depends: T1–T8)


# Tactical UI 后端绑定（权限 / 目录 / 遥测 / 耳语）

## Report

## [S1] Problem

战术深色 UI（频道树 / 音频矩阵 / 权限矩阵 / 服务器浏览器）已可运行，但后端与 UI 存在明显断层：

1. **权限页**是纯静态演示，无法读写真实 TS3 服务器组 / 权限 / 频道属性。
2. **服务器目录与书签**是硬编码演示数据，不能反映配置、最近连接或用户书签。
3. **主界面遥测**（丢包、3D 定位、优先发言、安全等级等）多数未进入 `ClientInfo` / `ChannelNode`，界面只能显示占位。
4. **音频设置页**的耳语目标、检测模式与快捷键未与网关会话双向同步。

浏览器仍通过 **9987 语音口**以客户端协议连接；权限与频道管理需要 **ServerQuery 管理口（默认 10011）**。现有 `@honeybbq/teamspeak-client` 仅覆盖 UDP 语音客户端，不包含 ServerQuery。

## [S2] Design

### 目标原则

- **前端视觉保持不变**：不改布局与交互结构；仅做**数据绑定**（静态演示值 → 真实数据；按钮触发真实网关指令）。
- **密钥不进浏览器**：ServerQuery 用户/密码只存在网关环境变量。
- **Mock 可完整走通**：`PROTOCOL=mock` 时权限/目录/遥测均有可演示数据，便于开发与 CI。
- **向后兼容**：现有 `ClientToGateway` / `GatewayToClient` 消息保持可用；新能力用**增量 type** 扩展。

### 架构

```
Browser (tactical UI)
   │  /ws  JSON + Binary voice  （现有）
   ▼
Node Gateway
   ├─ VoiceClientAdapter (9987 UDP)   — 连接/频道/聊天/语音（已有）
   ├─ ServerQueryClient (10011 TCP)   — 权限/频道属性/服务器组（新增，按会话按需连接）
   ├─ CatalogStore                    — 书签/最近连接（新增，JSON 文件）
   └─ /config /api/catalog            — 目录只读配置（扩展）
```

### 1. 协议扩展（`shared/types.ts`）

在现有 union 上**新增**消息类型，不删除旧消息。

#### 1.1 客户端 → 网关（权限 / 服务器目录 / 耳语同步）

| type | 载荷 | 说明 |
|------|------|------|
| `serverquery_connect` | `{ host, queryPort, username, password }` | 建立管理连接；成功后 `serverquery_status` |
| `serverquery_disconnect` | `{}` | 断开管理连接 |
| `permission_snapshot` | `{}` | 拉取：安全上下文列表、权限树、指定频道检查器、审计尾部 |
| `permission_apply` | `{ tierId, changes: PermChange[] }` | 应用勾选变更（`key` + `enabled` / `value`） |
| `channel_update` | `{ channelId, patch: ChannelPatch }` | 频道检查器保存（名称、描述、最大人数、持久化、码率、密码开关） |
| `catalog_list` | `{}` | 拉取书签 + 最近连接 |
| `catalog_add_bookmark` | `{ name, host, port, nickname? }` | 新增书签 |
| `catalog_remove_bookmark` | `{ id }` | 删除书签 |
| `whisper_sync` | `{ clients: number[], channels: number[] }` | 将音频设置页耳语列表同步到语音适配器 |

`PermChange`：

```ts
type PermChange =
  | { key: string; enabled: boolean }           // b_* 布尔
  | { key: string; value: number | string }     // i_* / s_*
```

`ChannelPatch`：

```ts
type ChannelPatch = Partial<{
  name: string
  topic: string
  description: string
  maxClients: number
  permanent: boolean
  codec: number
  codecQuality: number
  password: string | null   // null=清除
}>
```

#### 1.2 网关 → 客户端

| type | 载荷 | 说明 |
|------|------|------|
| `serverquery_status` | `{ connected: boolean; serverVersion?: string; error?: string }` | 管理连接状态 |
| `permission_snapshot` | `{ tiers: SecurityTier[]; tree: PermGroupNode[]; inspector: ChannelInspector; audit: AuditEntry[] }` | 权限页完整快照 |
| `permission_apply_ok` | `{ tierId: string; applied: number }` | 应用成功 |
| `catalog` | `{ bookmarks: Bookmark[]; recent: RecentEntry[] }` | 目录数据 |
| `client_list` / `channel_tree` | **扩展字段**（见下） | 遥测补全时重发 |

#### 1.3 扩展实体（前端只读消费，UI 已有位置）

```ts
interface ClientInfo {
  // 既有字段…
  packetLoss?: number        // 0–1
  positionDeg?: number       // 0–359；null 视为中心
  isPrioritySpeaker?: boolean
  groupIds?: number[]
}

interface ChannelNode {
  // 既有字段…
  topic?: string
  description?: string
  codec?: number
  codecQuality?: number
  neededTalkPower?: number
  isPasswordProtected?: boolean
  isDefault?: boolean
  order?: number
}

interface SecurityTier {
  id: string          // group id 字符串
  name: string
  gid: number
  talkPower: number
  icon: 'shield' | 'person' | 'badge' | 'token' | 'mic' | 'group'
}

interface PermGroupNode {
  id: 'global' | 'channel' | 'talk'
  title: string
  items: PermItem[]
}

interface PermItem {
  key: string
  desc: string
  valueLabel: string  // "75" / "UNLIMITED" / "ACTIVE"
  enabled: boolean
  editable: boolean
}

interface ChannelInspector {
  channelId: number
  name: string
  topic: string
  description: string
  maxClients: number
  permanent: boolean
  semiPermanent: boolean
  temporary: boolean
  codecQuality: number
  passwordEnabled: boolean
}

interface AuditEntry {
  ts: number
  tag: 'perm_edit' | 'chan_mod' | 'access_deny' | 'whisper_sync' | 'sq_connect'
  detail: string
  status: 'ok' | 'warn' | 'err'
  statusText: string
}

interface Bookmark {
  id: string
  name: string
  host: string
  port: number
  nickname?: string
  note?: string
  autoJoin?: boolean
}

interface RecentEntry {
  host: string
  port: number
  nickname?: string
  ts: number
}
```

前端映射（**不改视觉结构，只替换数据源**）：

- 权限页 `TIERS` / `GLOBAL_PERMS` 等 → `permission_snapshot`
- 「提交变更」→ `permission_apply`；「保存更改」→ `channel_update`
- 服务器目录演示列表 → `catalog.bookmarks + catalog.recent`；「发现 N 个服务器」= 书签+最近合并计数
- 主界面成员卡「丢包 / 3D / 优先发言」→ 扩展 `ClientInfo`
- 音频页耳语相关按钮 → `whisper_sync` / 已有 `whisper_add` / `whisper_clear`

### 2. ServerQuery 客户端（网关）

**选型**：优先自研 **薄 TCP ServerQuery 客户端**（协议稳定、依赖少、可控超时/转义）；若实现成本过高，可采用开源库 `ts3-nodejs-library`（MIT，成熟 ServerQuery 封装）。两者接口在网关内用同一 `ServerQueryPort` 抽象，便于替换。

职责：

1. TCP 连接 `host:queryPort`（默认 10011）
2. `login client_login_name=… client_login_password=…`
3. `use sid=<voiceServerId>`（0 = 默认虚拟服务器）
4. 封装命令：`servergrouplist`、`channelinfo`、`channellist`、`serverinfo`、`clientinfo`、`permget`、`permadd` / `set client_perm` 等（按下方最小集）
5. 解析 TS 转义（`\\ \/ \| \p \n \r \t \s`）
6. 超时与断线清理；**不**长期空转轮询（按 snapshot 拉取）

**最小权限命令集（S2 范围）**：

| 目的 | 命令（示意） |
|------|----------------|
| 安全上下文列表 | `servergrouplist` |
| 当前用户权限自检 | `clientinfo` / `serverinfo` |
| 权限树读取 | `permget permid=<known keys>` 或 `permlist` + 过滤白名单 |
| 布尔权限写 | `set` / `permadd`（`b_client_*` 等） |
| 频道检查器 | `channelinfo cid=` + `channelupdate` |
| 审计 | 网关本地环形缓冲（最近 50 条 SQ 操作日志），**不**假设服务器有完整 audit API |

**权限键白名单**（与 UI `PermGroupNode` 对齐，避免全量 permlist 噪声）：

- Global: `b_client_kick_from_server`, `b_client_ban_create`, `b_client_remoteaddress_view`
- Channel: `b_channel_create_permanent`, `b_channel_delete_flag_force`, `i_channel_maxclients`, `i_channel_create_modify_codec_max_quality`
- Talk: `i_client_talk_power`, `i_client_grant_talk_power`, `b_client_is_priority_speaker`, `b_client_whisper_list_target`

Mock 适配器返回与真实同构的 `permission_snapshot`，并接受 `permission_apply` / `channel_update` 更新内存态。

### 3. 服务器目录与书签

**数据源**（按优先级）：

1. `GET /config` → 已有 `defaultHost` / `defaultPort` / `defaultNickname`
2. `GET /api/catalog`（需 token，若有）→ 书签 JSON
3. WS `catalog_list` → 书签 + 会话内最近连接
4. 前端手动直连（已有 CONNECT 表单）→ 成功后写入 recent

**存储**：

- 路径：`gateway/data/catalog.json`（与 identity 同目录策略；Docker volume）
- 结构：`{ bookmarks: Bookmark[] }`；recent 仅内存/会话级（或同文件 `recent[]` 上限 20）
- 环境变量 `CATALOG_PATH` 可覆盖
- 无写权限时降级为只读空列表 + 错误提示（不崩溃）

**UI 绑定**：

- 「固定书签」← `catalog.bookmarks`；RECONNECT/连接 → 现有 `connectFromLogin`
- 游戏标签筛选：书签可选 `gameTag` 字段（CS2/Valorant…），默认 `全部`
- 「公共节点中继健康度」保持装饰性静态（明确 Out of Scope 为真实中继探测）

### 4. 主界面遥测补全

`ClientInfo` 增加：

| 字段 | TS3 来源（示意） | UI |
|------|------------------|-----|
| `packetLoss` | client `client_lost_packets` / 总量 或 gateway 估算 | `LOSS: x%` |
| `positionDeg` | 无直接 3D API 时：频道内按 id 均匀角度伪定位，或省略 | `3D AUDIO: ±N°` |
| `isPrioritySpeaker` | `client_is_priority_speaker` / 优先发言标记 | ⭐ 徽章 |
| `isCommander` | talk power / server group 高权限启发 | 指挥官徽章（已有字段） |

**Mock**：随机稳定伪数据（按 clientId 哈希），保证截图级 UI 有值。  
**真 TS3**：`clientinfo` 轮询间隔 ≥ 3s；无权限字段时省略而非伪造 0。  
频道树：`channelinfo` 可选增强（密码锁、容量）——若开销大则仅对当前频道拉取 inspector。

### 5. 音频设置页绑定

| UI 区域 | 绑定 |
|---------|------|
| 检测模式 VAD/PTT/常开 | 已有本地 `mic.setVox`（保留） |
| 耳语列表模块 | 读写 `whisperClients` / `whisperChannels`；变更发 `whisper_sync` |
| 快捷键表 | 前端已绑 PTT 键；展示用元数据；**不**实现浏览器全局热键劫持（Out of Scope） |
| 输入设备 / AEC / AGC | 保持本地 WebAudio（已有） |

### 6. 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `SQ_HOST` | 空 = 与连接 host 相同 | ServerQuery 主机 |
| `SQ_PORT` | `10011` | ServerQuery 端口 |
| `SQ_USERNAME` | 空 | 管理员账号 |
| `SQ_PASSWORD` | 空 | 管理员密码（缺省则权限页返回 `serverquery_status.connected=false`） |
| `SQ_SERVER_ID` | `0` | 虚拟服务器 id |
| `CATALOG_PATH` | `gateway/data/catalog.json` | 书签文件 |
| `PERMISSIONS_ENABLED` | `1` | 为 `0` 时权限 API 直接返回不可用 |

### 7. 安全

- ServerQuery 凭据仅网关 env；**禁止**写入 `/config` 响应或 WS 任意消息回显。
- `permission_apply` / `channel_update` 仅在 `serverquery_status.connected` 时执行。
- 沿用现有 host 白名单 / 私网策略于 **voice** 连接；SQ 主机同样走 `assertHostAllowed`（或独立 `SQ_ALLOW_PRIVATE_HOSTS`，默认与 voice 一致）。
- 审计条目不包含密码。

### 8. 参考实现（开源）

| 能力 | 参考 |
|------|------|
| ServerQuery 协议 / 命令 | TeamSpeak 3 ServerQuery Manual；`ts3-nodejs-library` |
| 语音客户端（已有） | `@honeybbq/teamspeak-client` |
| 书签持久化 | 自研 JSON；风格对齐现有 `gateway/data/identity.txt` |

### 9. 测试边界

- 单测：SQ 协议解析/转义、catalog 读写、mock permission snapshot/apply、session 新消息路由。
- 冒烟：mock 下 WS `permission_snapshot` / `catalog_list` 往返；无 SQ 配置时优雅降级。
- 不在 CI 连真实 TS3/SQ。

## [S3] Out of Scope

- 改动战术 UI 布局、视觉 token、中文文案结构
- 浏览器端直接 TCP ServerQuery
- 公网第三方服务器发现 API / 真实中继健康探测
- 完整 ban 管理、客户端踢封 UI、服务器创建向导
- 浏览器全局系统热键注册
- 多虚拟服务器并行权限管理 UI（仅支持 `SQ_SERVER_ID` 单服）
- 音频编解码与语音管线改动

## Tasks

- [ ] T1: 扩展 `shared/types.ts` 权限/目录/遥测消息与实体 — acceptance: typecheck 通过，新 type 可被 gateway/frontend 引用 (covers: S2.1)
- [ ] T2: 网关 ServerQuery 薄客户端 + mock 同构实现 — acceptance: mock 权限快照单测通过；真 SQ 配置缺失时 status disconnected (covers: S2.2; depends: T1)
- [ ] T3: Session 路由：permission/channel_update/catalog/whisper_sync — acceptance: WS 单测覆盖新消息；非法状态返回 error (covers: S2.1–2.4; depends: T1, T2)
- [ ] T4: CatalogStore 书签持久化 + `/api/catalog` — acceptance: 增删书签后文件更新；无写权限降级 (covers: S2.3; depends: T1)
- [ ] T5: TS3 adapter 遥测字段抽取（packetLoss / priority / channel meta）— acceptance: ts3 单元解析测试；无数据时字段省略 (covers: S2.4; depends: T1)
- [ ] T6: mock adapter 演示数据对齐 UI — acceptance: mock 连接后权限页/目录/成员遥测非空且稳定 (covers: S2.2–2.4; depends: T1)
- [ ] T7: 前端权限页/目录/成员卡/耳语列表数据绑定（保持 DOM 结构）— acceptance: 无静态假表头假行；操作触发对应 WS 消息 (covers: S2.1–2.4; depends: T1–T6)
- [ ] T8: 环境变量文档 + .env.example + README 片段 — acceptance: 文档列出 SQ_* / CATALOG_* (covers: S2.6)
- [ ] T9: 验证 typecheck / lint / unit / build + mock WS 冒烟 — acceptance: 命令全 PASS 或标注 PRE-EXISTING (covers: S1, S2; depends: T1–T8)
