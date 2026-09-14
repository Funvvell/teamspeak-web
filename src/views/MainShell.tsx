import type { MutableRefObject } from 'react'
import type { ChannelNode, ClientInfo } from '../../shared/types'
import { ChannelListView } from '../components/ChannelListView'
import {
  BellIcon,
  HeadphoneIcon,
  MicIcon,
  MusicIcon,
  PersonIcon,
  WaveBars,
} from '../components/icons'
import { LOG_ICON, formatTime, saveCollapsed, type LogItem } from '../lib/utils'
import { Button } from '@shared/components/ui/button'
import { Input } from '@shared/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@shared/components/ui/tabs'
import type { ConnectionTab, MicrophoneController } from './types'

export type StatusKind = 'talking' | 'muted' | 'listen' | 'idle'

export interface MainShellProps {
  active: ConnectionTab
  tabs: ConnectionTab[]
  mobileTab: 'tree' | 'voice' | 'chat'
  setMobileTab: (t: 'tree' | 'voice' | 'chat') => void
  serverMemberCount: number
  filterText: string
  setFilterText: (v: string) => void
  filterInputRef: MutableRefObject<HTMLInputElement | null>
  treeCollapsed: boolean
  setTreeCollapsed: (fn: (v: boolean) => boolean) => void
  treeBodyRef: MutableRefObject<HTMLDivElement | null>
  updateMyChanVisibility: () => void
  activeChannelId: number | null
  selectedChannelId: number | null
  setSelectedChannelId: (id: number | null) => void
  handleJoin: (channelId: number) => void
  openMenu: (client: ClientInfo, e: React.MouseEvent) => void
  collapsed: Set<number>
  setCollapsed: (fn: (prev: Set<number>) => Set<number>) => void
  myChanDir: 'up' | 'down' | null
  setActiveId: (id: string) => void
  patchTab: (id: string, patch: Partial<ConnectionTab>) => void
  closeTab: (id: string) => void
  addTab: () => void
  channelName: string
  channelPath: string[]
  whisperActive: boolean
  soundsOn: boolean
  toggleSounds: () => void
  musicBotUrl: string
  openSettings: (nav: 'audio' | 'account') => void
  inviteCopy: () => void
  insecureContext: boolean
  httpsDismissed: boolean
  dismissHttpsBar: () => void
  reconnecting: boolean
  reconnectFailed: boolean
  cancelReconnect: (id: string) => void
  retryReconnect: (id: string) => void
  selfLatency: number | null
  focusMember: ClientInfo | null
  statusFor: (c: ClientInfo) => { text: string; kind: StatusKind }
  channelMembers: ClientInfo[]
  talkingCount: number
  meterLevel: number
  muted: boolean
  deafened: boolean
  uplink: boolean
  volumes: Record<string, number>
  setClientVol: (id: number, v: number) => void
  lat: (c: ClientInfo) => number | string
  sideTab: 'chat' | 'events'
  setSideTab: (t: 'chat' | 'events') => void
  chatLogRef: MutableRefObject<HTMLDivElement | null>
  chatPinned: MutableRefObject<boolean>
  chatAnimBase: number
  newMsgCount: number
  setNewMsgCount: (v: number | ((n: number) => number)) => void
  draft: string
  setDraft: (v: string) => void
  handleSend: () => void
  connected: boolean
  recentLogs: LogItem[]
  logText: (l: LogItem) => string
  channelDesc: string
  channelById: Map<number, ChannelNode>
  userStateCls: (c: ClientInfo) => string
  mic: MicrophoneController
  voxPct: number
  speakers: ClientInfo[]
  toggleMute: () => void
  toggleDeafen: () => void
}

export function MainShell({
  active,
  tabs,
  mobileTab,
  setMobileTab,
  serverMemberCount,
  filterText,
  setFilterText,
  filterInputRef,
  treeCollapsed,
  setTreeCollapsed,
  treeBodyRef,
  updateMyChanVisibility,
  activeChannelId,
  selectedChannelId,
  setSelectedChannelId,
  handleJoin,
  openMenu,
  collapsed,
  setCollapsed,
  myChanDir,
  setActiveId,
  patchTab,
  closeTab,
  addTab,
  channelName,
  channelPath,
  whisperActive,
  soundsOn,
  toggleSounds,
  musicBotUrl,
  openSettings,
  inviteCopy,
  insecureContext,
  httpsDismissed,
  dismissHttpsBar,
  reconnecting,
  reconnectFailed,
  cancelReconnect,
  retryReconnect,
  selfLatency,
  focusMember,
  statusFor,
  channelMembers,
  talkingCount,
  meterLevel,
  muted,
  deafened,
  uplink,
  volumes,
  setClientVol,
  lat,
  sideTab,
  setSideTab,
  chatLogRef,
  chatPinned,
  chatAnimBase,
  newMsgCount,
  setNewMsgCount,
  draft,
  setDraft,
  handleSend,
  connected,
  recentLogs,
  logText,
  channelDesc,
  channelById,
  userStateCls,
  mic,
  voxPct,
  speakers,
  toggleMute,
  toggleDeafen,
}: MainShellProps) {
  return (
    <div className="app-shell">
      <aside className={`channel-sidebar${mobileTab === 'tree' ? ' m-active' : ''}`}>
        <div className="server-head">
          <div className="server-info">
            <div className="server-name">
              {active?.serverName || active?.host}
            </div>
            <div className="server-meta">
              {active?.channels.length ?? 0} 个频道 · {serverMemberCount} 位成员
            </div>
          </div>
        </div>
        <div className="filter-row">
          <input
            ref={filterInputRef}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="搜索"
            aria-label="过滤频道/成员"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setFilterText('')
            }}
          />
        </div>
        <div className="side-section tree-section">
          <button
            type="button"
            className={`section-bar${treeCollapsed ? ' collapsed' : ''}`}
            onClick={() => setTreeCollapsed((v) => !v)}
          >
            <span className="section-title">频道</span>
            <span className="section-count">{active?.channels.length ?? 0}</span>
            <i className="section-arrow">{treeCollapsed ? '▸' : '▾'}</i>
          </button>
          {!treeCollapsed && (
            <div className="body" ref={treeBodyRef} onScroll={updateMyChanVisibility}>
              <ChannelListView
                channels={active?.channels || []}
                selfId={active?.selfId ?? null}
                activeChannelId={activeChannelId}
                selectedChannelId={selectedChannelId}
                onSelect={setSelectedChannelId}
                onJoin={handleJoin}
                onClientMenu={openMenu}
                collapsed={collapsed}
                onToggleCollapse={(id) => {
                  setCollapsed((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    saveCollapsed(next)
                    return next
                  })
                }}
                filter={filterText}
              />
            </div>
          )}
          {myChanDir && !treeCollapsed && (
            <button
              type="button"
              className="back-to-my"
              onClick={() => {
                const row = treeBodyRef.current?.querySelector(
                  `[data-channel-id="${activeChannelId}"]`,
                )
                row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }}
            >
              {myChanDir === 'up' ? '↑' : '↓'} 回到我的频道
            </button>
          )}
        </div>
        <div className="channel-foot">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={`tab${t.id === active?.id ? ' active' : ''}`}
              role="button"
              tabIndex={0}
              title={`${t.host}:${t.port}`}
              onClick={() => {
                setActiveId(t.id)
                patchTab(t.id, { unread: 0, unreadMention: false })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveId(t.id)
                  patchTab(t.id, { unread: 0, unreadMention: false })
                }
              }}
            >
              <span
                className={`dot${t.connState === 'connected' ? ' talking' : ''}`}
              />
              {t.serverName || t.host || '新连接'}
              {t.unread > 0 && t.id !== active?.id && (
                <span
                  className={`unread-dot${t.unreadMention ? ' mention' : ''}`}
                />
              )}
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="tab-close"
                  aria-label={`关闭 ${t.serverName || t.host || '新连接'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.id)
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" className="tab add" onClick={addTab} title="新建连接">
            +
          </button>
        </div>
      </aside>

      <section className={`workspace${mobileTab === 'voice' ? ' m-active' : ''}`}>
        <header className="workspace-header">
          <div className="ws-title">
            <strong>{channelName}</strong>
            <span className="crumb">
              {channelPath.length > 0 ? channelPath.join(' › ') : '语音频道'}
            </span>
          </div>
          {whisperActive && (
            <span className="badge connecting">
              正在耳语 ({active.whisperClients.length + active.whisperChannels.length})
            </span>
          )}
          <div className="workspace-actions">
            <button
              type="button"
              className={`header-icon${soundsOn ? '' : ' off'}`}
              title={soundsOn ? '通知音效已打开' : '通知音效已关闭'}
              onClick={toggleSounds}
              aria-pressed={soundsOn}
            >
              <BellIcon />
            </button>
            <button
              type="button"
              className="header-icon"
              title="点歌机器人"
              aria-label="打开点歌机器人"
              disabled={!musicBotUrl}
              onClick={() => {
                if (musicBotUrl) {
                  window.open(musicBotUrl, '_blank', 'noopener,noreferrer')
                }
              }}
            >
              <MusicIcon />
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openSettings('audio')}
            >
              设置
            </Button>
            <Button variant="outline" size="sm" onClick={inviteCopy}>
              共享
            </Button>
            <button
              type="button"
              className="header-avatar"
              title={active?.nickname || '未命名'}
              onClick={() => openSettings('account')}
            >
              {(active?.nickname || '?').slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        {insecureContext && !httpsDismissed && (
          <div className="insecure-bar">
            <span>
              当前为非安全上下文（非 HTTPS），语音功能不可用 · 请配置 HTTPS
            </span>
            <button
              type="button"
              className="insecure-close"
              onClick={dismissHttpsBar}
            >
              ×
            </button>
          </div>
        )}
        {active && reconnecting && !reconnectFailed && (
          <div
            className="reconnect-bar"
            role="button"
            tabIndex={0}
            onClick={() => cancelReconnect(active.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') cancelReconnect(active.id)
            }}
          >
            <div className="reconnect-line" />
            <span>正在自动重连 {active.reconnectAttempts}/5 · 点击取消</span>
          </div>
        )}
        {active && reconnectFailed && (
          <div className="reconnect-bar failed">
            <span>自动重连失败</span>
            <span className="reconnect-actions">
              <button type="button" onClick={() => retryReconnect(active.id)}>
                重试
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => cancelReconnect(active.id)}
              >
                放弃
              </button>
            </span>
          </div>
        )}

        <div className="workspace-scroll">
          <div className="workspace-content">
            <div className="meta-strip">
              <span className="meta-item">
                <span>类型</span>
                <strong>语音</strong>
              </span>
              <span className="meta-item">
                <span>编码</span>
                <strong>Opus</strong>
              </span>
              <span className="meta-item">
                <span>协议</span>
                <strong>TS3</strong>
              </span>
              <span className="meta-item">
                <span>延迟</span>
                <strong>{selfLatency != null ? `${selfLatency}ms` : '—'}</strong>
              </span>
              <span className="meta-item">
                <span>地址</span>
                <strong>{active?.host || '—'}</strong>
              </span>
              {focusMember && (
                <span
                  className={`meta-item focus${
                    statusFor(focusMember).kind === 'talking' ? ' talk' : ''
                  }`}
                >
                  <span>焦点</span>
                  <strong>
                    {focusMember.nickname}
                    {focusMember.id === active?.selfId ? '（我）' : ''}
                  </strong>
                  <WaveBars active={statusFor(focusMember).kind === 'talking'} />
                </span>
              )}
            </div>

            <div className="member-list content-members">
              <div className="member-list-head">
                <span>成员</span>
                <span className="member-count">
                  共 {channelMembers.length} 人 · {talkingCount} 人正在说话
                </span>
              </div>
              {channelMembers.map((c) => {
                const st = statusFor(c)
                return (
                  <div
                    key={c.id}
                    className={`member-chip${st.kind === 'talking' ? ' talking' : ''}`}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openMenu(c, e)
                    }}
                  >
                    <span className={`avatar avatar-md kind-${st.kind}`}>
                      <PersonIcon />
                      {st.kind === 'muted' && (
                        <i className="avatar-mic-off">
                          <MicIcon off />
                        </i>
                      )}
                      {st.kind === 'listen' && (
                        <i className="avatar-listen">
                          <HeadphoneIcon />
                        </i>
                      )}
                    </span>
                    <span className="chip-text">
                      <span className="chip-name">
                        {c.nickname}
                        {c.id === active?.selfId && <em>（我）</em>}
                      </span>
                      <span className={`chip-status kind-${st.kind}`}>
                        {st.text}
                      </span>
                    </span>
                    {c.id === active?.selfId ? (
                      <span
                        className="inline-meter"
                        aria-hidden="true"
                        title="输入电平"
                      >
                        <i
                          style={{
                            width: `${Math.round((muted ? 0 : meterLevel) * 100)}%`,
                          }}
                        />
                      </span>
                    ) : (
                      <div className="member-vol" title={`${c.nickname} 收听音量`}>
                        {(() => {
                          const vol = Math.round(
                            (volumes[String(c.id)] ?? 1) * 100,
                          )
                          const pct = (vol / 200) * 100
                          return (
                            <>
                              <span className="member-vol-track" aria-hidden="true">
                                <i className="member-vol-fill" style={{ width: `${pct}%` }} />
                              </span>
                              <input
                                type="range"
                                className="member-vol-range"
                                min={0}
                                max={200}
                                step={1}
                                value={vol}
                                onChange={(e) =>
                                  setClientVol(
                                    c.id,
                                    Number(e.target.value) / 100,
                                  )
                                }
                                aria-label={`${c.nickname} 收听音量`}
                              />
                            </>
                          )
                        })()}
                      </div>
                    )}
                    <span className="chip-meta">
                      {lat(c) === '—' ? '—' : `${lat(c)}ms`}
                    </span>
                  </div>
                )
              })}
              {channelMembers.length === 0 && (
                <div className="empty">此频道暂无成员</div>
              )}
            </div>

            <div className="chat-block">
              <Tabs
                value={sideTab}
                onValueChange={(v) => {
                  setSideTab(v as 'chat' | 'events')
                  if (v === 'events' && active)
                    patchTab(active.id, { eventsUnread: 0 })
                }}
                className="side-tabs"
              >
                <TabsList className="h-9 gap-0 bg-transparent p-0 shadow-none border-0">
                  <TabsTrigger value="chat" className="side-tab-brutal">
                    信息
                  </TabsTrigger>
                  <TabsTrigger value="events" className="side-tab-brutal">
                    活动
                    {active && active.eventsUnread > 0 && sideTab !== 'events' && (
                      <span className="side-badge">{active.eventsUnread}</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {sideTab === 'chat' ? (
                <>
                  <div className="chat-wrap">
                    <div
                      className="chat-log"
                      ref={chatLogRef}
                      onScroll={(e) => {
                        const el = e.currentTarget
                        chatPinned.current =
                          el.scrollHeight - el.scrollTop - el.clientHeight < 40
                        if (chatPinned.current) setNewMsgCount(0)
                      }}
                    >
                      {!active?.messages.length && (
                        <div className="empty">暂无消息</div>
                      )}
                      {active?.messages.map((m, i) => {
                        const isNew = i >= chatAnimBase
                        return (
                          <div
                            key={`${m.fromId}-${m.ts}-${m.text.length}-${i}`}
                            className="msg"
                            style={
                              isNew
                                ? { animationDelay: `${Math.min((i - chatAnimBase) * 45, 450)}ms` }
                                : { animation: 'none' }
                            }
                          >
                            <span className="from">{m.from}</span>
                            {m.whisper && <span className="badge connecting">耳语</span>}{' '}
                            <span>{m.text}</span>
                            <span className="time">{formatTime(m.ts)}</span>
                          </div>
                        )
                      })}
                    </div>
                    {newMsgCount > 0 && (
                      <button
                        type="button"
                        className="new-msg-pill"
                        onClick={() => {
                          const el = chatLogRef.current
                          if (el) el.scrollTop = el.scrollHeight
                          chatPinned.current = true
                          setNewMsgCount(0)
                        }}
                      >
                        {newMsgCount} 条新信息
                      </button>
                    )}
                  </div>
                  <div className="chat-input">
                    <select
                      value={active?.chatTarget || 'channel'}
                      onChange={(e) => {
                        if (!active) return
                        const v = e.target.value as 'channel' | 'server' | 'pm'
                        patchTab(active.id, { chatTarget: v })
                      }}
                      disabled={!connected}
                    >
                      <option value="channel">当前频道</option>
                      <option value="server">服务器</option>
                      <option value="pm">私聊</option>
                    </select>
                    {active?.chatTarget === 'pm' && (
                      <select
                        value={active.pmTarget ?? ''}
                        onChange={(e) => {
                          if (!active) return
                          patchTab(active.id, {
                            pmTarget: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }}
                        disabled={!connected}
                      >
                        <option value="">选择成员</option>
                        {active.clients
                          .filter((c) => c.id !== active.selfId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nickname}
                            </option>
                          ))}
                      </select>
                    )}
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSend()
                        }
                      }}
                      placeholder={connected ? '输入信息' : '连接后可发送'}
                      disabled={!connected}
                      className="flex-1 h-10"
                    />
                    <Button
                      variant="primary"
                      onClick={handleSend}
                      disabled={!connected}
                      className="h-10 px-6"
                    >
                      发送
                    </Button>
                  </div>
                </>
              ) : (
                <div className="chat-log events-log">
                  <div className="events-head">
                    <h3>活动</h3>
                    <span className="activity-hint">{channelDesc.slice(0, 40)}…</span>
                  </div>
                  {!active?.logs.length && (
                    <div className="empty">暂无活动</div>
                  )}
                  {(active?.logs.length ? active.logs : recentLogs).map((e, i) => (
                    <div key={`${e.ts}-${i}`} className="msg">
                      <span className="from">{LOG_ICON[e.event]}</span>
                      <span>{logText(e)}</span>
                      <span className="time">{formatTime(e.ts)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      <aside className="member-panel">
        <div className="member-panel-heading">
          <h2>在线</h2>
          <span className="member-panel-count">{serverMemberCount}</span>
        </div>
        <div className="member-panel-list">
          {(active?.clients ?? []).map((u) => (
            <div
              key={u.id}
              className={`user-row${u.id === active?.selfId ? ' me' : ''}${u.isTalking ? ' talking' : ''}`}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(u, e)
              }}
            >
              <span className={`user-state ${userStateCls(u)}`} />
              <span className="user-nick">
                {u.nickname}
                {u.id === active?.selfId && <em>（我）</em>}
              </span>
              <span className="user-channel">
                {channelById.get(u.channelId)?.name ?? ''}
              </span>
            </div>
          ))}
          {(active?.clients ?? []).length === 0 && (
            <div className="empty">暂无在线成员</div>
          )}
        </div>
      </aside>

      <footer className="control-dock">
        <div className="dock-user">
          <button
            type="button"
            className={`dock-mic${muted || deafened ? ' off' : ''}${uplink ? ' uplink' : ''}`}
            onClick={toggleMute}
            disabled={deafened}
            title={muted ? '取消静音（Ctrl+M）' : '静音麦克风（Ctrl+M）'}
            aria-pressed={muted}
          >
            <MicIcon off={muted || deafened || !mic.state.micOn} size={18} />
          </button>
          <div className="dock-copy">
            <strong>{active?.nickname || '未命名'}</strong>
            <span className="dock-live">
              <i className={`live-dot${uplink ? ' on' : ''}`} />
              {mic.state.micOn
                ? muted
                  ? '已静音'
                  : uplink
                    ? '正在发送'
                    : mic.state.vox.mode.toUpperCase()
                : '麦克风已关闭'}
            </span>
          </div>
        </div>
        <div className="dock-center">
          {(() => {
            const vol = Math.round(mic.state.outputVolume * 100)
            const pct = (vol / 200) * 100
            return (
              <div className="dock-volume" title="收听音量">
                <span className="dock-vol-label">收听</span>
                <div className="member-vol dock-vol-slider">
                  <span className="member-vol-track" aria-hidden="true">
                    <i className="member-vol-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <input
                    type="range"
                    className="member-vol-range"
                    min={0}
                    max={200}
                    step={1}
                    value={vol}
                    onChange={(e) =>
                      mic.setOutputVolume(Number(e.target.value) / 100)
                    }
                    aria-label="收听音量"
                  />
                </div>
                <span className="dock-vol-value">{vol}%</span>
              </div>
            )
          })()}
          <span className="dock-meta">
            VOX {voxPct}% · OPUS 32 · RTT{' '}
            {selfLatency != null ? `${selfLatency}ms` : '—'}
          </span>
          <span className="dock-speakers" aria-live="polite">
            {speakers.length
              ? `正在说话 · ${speakers.slice(0, 2).map((c) => c.nickname).join(', ')}${
                  speakers.length > 2 ? ` +${speakers.length - 2}` : ''
                }`
              : ''}
          </span>
        </div>
        <div className="dock-actions">
          <button
            type="button"
            className={`dock-btn${deafened ? ' on' : ''}`}
            onClick={toggleDeafen}
            aria-pressed={deafened}
            title="Deafen"
          >
            <HeadphoneIcon off={deafened} size={18} />
            <span>{deafened ? '闭听中' : '闭听'}</span>
          </button>
        </div>
      </footer>

      <nav className="mobile-tabbar" aria-label="移动端导航">
        <button
          type="button"
          className={mobileTab === 'tree' ? 'active' : ''}
          onClick={() => setMobileTab('tree')}
          aria-current={mobileTab === 'tree' ? 'page' : undefined}
        >
          频道
        </button>
        <button
          type="button"
          className={mobileTab === 'voice' ? 'active' : ''}
          onClick={() => setMobileTab('voice')}
          aria-current={mobileTab === 'voice' ? 'page' : undefined}
        >
          语音
        </button>
        <button
          type="button"
          className={mobileTab === 'chat' ? 'active' : ''}
          onClick={() => setMobileTab('chat')}
          aria-current={mobileTab === 'chat' ? 'page' : undefined}
        >
          信息
          {newMsgCount > 0 && (
            <span className="tab-badge">{newMsgCount > 99 ? '99+' : newMsgCount}</span>
          )}
        </button>
      </nav>
    </div>
  )
}
