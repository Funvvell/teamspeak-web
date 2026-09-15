import type { MutableRefObject } from 'react'
import type { ChannelNode, ClientInfo } from '../../shared/types'
import {
  IcCheck,
  IcHeadset,
  IcHeadsetOff,
  IcMic,
  IcMicOff,
  IcPriority,
  IcSearch,
  IcShieldPerson,
  IcVolumeUp,
  IcWave,
  WaveBars,
} from '../components/TacIcons'
import { formatTime, saveCollapsed, type LogItem } from '../lib/utils'
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
  disconnect?: () => void
}

export function MainShell(props: MainShellProps) {
  const {
    active,
    tabs,
    mobileTab,
    setMobileTab,
    serverMemberCount,
    filterText,
    setFilterText,
    filterInputRef,
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
    channelPath: _channelPath,
    whisperActive,
    soundsOn: _soundsOn,
    toggleSounds: _toggleSounds,
    musicBotUrl: _musicBotUrl,
    openSettings,
    inviteCopy: _inviteCopy,
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
    talkingCount: _talkingCount,
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
    userStateCls: _userStateCls,
    mic,
    voxPct: _voxPct,
    speakers: _speakers,
    toggleMute,
    toggleDeafen,
    disconnect,
  } = props

  const memberCap =
    activeChannelId != null
      ? (channelById.get(activeChannelId)?.maxClients ?? null)
      : null
  const fullBadge =
    memberCap != null && memberCap > 0 && channelMembers.length >= memberCap
      ? `${channelMembers.length} / ${memberCap} FULL`
      : `${channelMembers.length} / ${memberCap && memberCap > 0 ? memberCap : '—'}`

  return (
    <>
      {/* ===== Channel Tree ===== */}
      <aside className={`channel-sidebar${mobileTab === 'tree' ? ' m-active' : ''}`}>
        <div className="server-head">
          <div className="server-head-left">
            <IcVolumeUp size={16} />
            <div style={{ minWidth: 0 }}>
              <div className="server-name">频道目录</div>
              <div className="server-meta">
                {active?.serverName || active?.host || '—'} · {serverMemberCount}
                /{Math.max(serverMemberCount, 64)}
              </div>
            </div>
          </div>
          <div className="head-actions">
            <button
              type="button"
              className="icon-btn"
              title="折叠全部"
              aria-label="折叠全部"
              onClick={() => setTreeCollapsed((v) => !v)}
            >
              <span style={{ fontSize: 12 }}>≡</span>
            </button>
            <button
              type="button"
              className="icon-btn accent"
              title="新建频道"
              aria-label="新建频道"
            >
              <span style={{ fontSize: 12 }}>+</span>
            </button>
          </div>
        </div>
        <div className="filter-row">
          <span className="f-icon">
            <IcSearch size={14} />
          </span>
          <input
            ref={filterInputRef}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="过滤频道与成员 (Ctrl+F)"
            aria-label="过滤频道/成员"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setFilterText('')
            }}
          />
          <span className="f-kbd">/</span>
        </div>
        <div className="side-section tree-section">
          <button
            type="button"
            className="section-bar"
            onClick={() => setTreeCollapsed((v) => !v)}
          >
            <span>频道树</span>
            <span className="section-count">{active?.channels.length ?? 0}</span>
          </button>
          <div className="body" ref={treeBodyRef} onScroll={updateMyChanVisibility}>
            <ChannelTree
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
              lat={lat}
              statusFor={statusFor}
            />
          </div>
          {myChanDir && (
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
        <div className="tree-status">
          <div className="tree-status-left">
            <span className="live-dot" />
            语音活动
          </div>
          <span className="tree-status-right">OPUS_VOICE_48K</span>
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
              <span className={`dot${t.connState === 'connected' ? ' talking' : ''}`} />
              {t.serverName || t.host || '新连接'}
              {t.unread > 0 && t.id !== active?.id && (
                <span className={`unread-dot${t.unreadMention ? ' mention' : ''}`} />
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

      {/* ===== Voice Stage ===== */}
      <section className={`workspace${mobileTab === 'voice' ? ' m-active' : ''}`}>
        {insecureContext && !httpsDismissed && (
          <div className="insecure-bar">
            <span>当前为非安全上下文（非 HTTPS），语音功能不可用 · 请配置 HTTPS</span>
            <button type="button" className="insecure-close" onClick={dismissHttpsBar}>
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

        <div className="stage-banner">
          <div className="stage-banner-left">
            <div className="stage-icon">
              <IcVolumeUp size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="stage-title-row">
                <h2 className="stage-title">{channelName}</h2>
                <span className="badge tertiary">{fullBadge}</span>
                <span className="badge cyan">Opus 128kbps</span>
                {whisperActive && (
                  <span className="badge blue">
                    耳语 ({active.whisperClients.length + active.whisperChannels.length})
                  </span>
                )}
              </div>
              <p className="stage-sub">
                {channelDesc || '语音频道'} · 编解码延迟 2.5ms
              </p>
            </div>
          </div>
          <div className="stage-actions">
            <button type="button" className="mix-btn" onClick={() => openSettings('audio')}>
              <IcWave size={14} />
              音频混音
            </button>
            {connected && (
              <button type="button" className="disc-btn" onClick={() => disconnect?.()}>
                <IcHeadset size={14} />
                断开连接
              </button>
            )}
          </div>
        </div>

        <div className="workspace-scroll">
          <div className="workspace-content">
            {focusMember && (
              <div className="meta-strip">
                <span className="meta-item">
                  <span>舞台延迟</span>
                  <strong>{selfLatency != null ? `${selfLatency}ms` : '—'}</strong>
                </span>
                <span className="meta-item">
                  <span>丢包补偿</span>
                  <strong>已启用</strong>
                </span>
                <span className="meta-item">
                  <span>自动增益</span>
                  <strong>已启用</strong>
                </span>
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
                </span>
              </div>
            )}

            <div className="member-list">
              {channelMembers.map((c) => {
                const st = statusFor(c)
                const isSelf = c.id === active?.selfId
                const vol = Math.round((volumes[String(c.id)] ?? 1) * 100)
                const pct = (vol / 200) * 100
                return (
                  <div
                    key={c.id}
                    className={`member-chip${st.kind === 'talking' ? ' talking' : ''}`}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openMenu(c, e)
                    }}
                  >
                    <div className="avatar-wrap">
                      <div className={`avatar kind-${st.kind}`}>
                        {st.kind === 'muted' ? <IcMicOff size={22} /> : st.kind === 'listen' ? <IcHeadsetOff size={22} /> : <IcMic size={22} />}
                      </div>
                      {isSelf && <span className="avatar-you">我</span>}
                    </div>
                    <div className="chip-text">
                      <div className="chip-name-row">
                        <span className="chip-name">
                          {c.nickname}
                          {isSelf && <em>（我）</em>}
                        </span>
                        {st.kind === 'talking' && (
                          <span className="badge green">
                            <IcPriority size={10} /> 指挥官
                          </span>
                        )}
                        {st.kind === 'muted' && <span className="badge danger">已静音</span>}
                        {st.kind === 'listen' && <span className="badge muted">已闭听</span>}
                      </div>
                      <div className="chip-stats">
                        <span>
                          延迟: <strong>{lat(c)}ms</strong>
                        </span>
                        <span>
                          丢包:{' '}
                          <strong>
                            {typeof c.packetLoss === 'number'
                              ? `${(c.packetLoss * 100).toFixed(1)}%`
                              : '—'}
                          </strong>
                        </span>
                        <span className="pos">
                          3D 定位:{' '}
                          <strong>
                            {typeof c.positionDeg === 'number'
                              ? `${c.positionDeg}°`
                              : '—'}
                          </strong>
                        </span>
                        {c.isPrioritySpeaker && (
                          <span className="badge green">
                            <IcPriority size={10} /> 优先发言
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="chip-controls">
                      <WaveBars
                        active={st.kind === 'talking'}
                        level={isSelf ? meterLevel : st.kind === 'talking' ? 0.7 : 0}
                      />
                      {isSelf ? (
                        <>
                          <div className="member-vol self-vol" title="输入电平">
                            <span className="member-vol-track" aria-hidden="true">
                              <i
                                className="member-vol-fill"
                                style={{ width: `${Math.round((muted ? 0 : meterLevel) * 100)}%` }}
                              />
                            </span>
                            <input
                              type="range"
                              className="member-vol-range"
                              min={0}
                              max={100}
                              step={1}
                              value={Math.round((muted ? 0 : meterLevel) * 100)}
                              readOnly
                              aria-label="输入电平"
                              tabIndex={-1}
                            />
                          </div>
                          <span className="vol-readout">0dB</span>
                        </>
                      ) : (
                        <>
                          <div className="member-vol" title={`${c.nickname} 收听音量`}>
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
                                setClientVol(c.id, Number(e.target.value) / 100)
                              }
                              aria-label={`${c.nickname} 收听音量`}
                            />
                          </div>
                          <span className="vol-readout">
                            {vol === 100
                              ? '0dB'
                              : `${vol - 100 >= 0 ? '+' : ''}${vol - 100}dB`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              {channelMembers.length === 0 && (
                <div className="empty">此频道暂无成员</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Chat & Logs ===== */}
      <aside className={`member-panel${mobileTab === 'chat' ? ' m-active' : ''}`}>
        <div className="chat-block">
          <div className="side-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'chat'}
              className="side-tab-brutal"
              data-state={sideTab === 'chat' ? 'active' : 'inactive'}
              onClick={() => setSideTab('chat')}
            >
              聊天与日志
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'events'}
              className="side-tab-brutal"
              data-state={sideTab === 'events' ? 'active' : 'inactive'}
              onClick={() => {
                setSideTab('events')
                if (active) patchTab(active.id, { eventsUnread: 0 })
              }}
            >
              客户端信息
              {active && active.eventsUnread > 0 && sideTab !== 'events' && (
                <span className="side-badge">{active.eventsUnread}</span>
              )}
            </button>
          </div>
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
                  {!active?.messages.length && !active?.logs.length && (
                    <div className="empty">暂无消息</div>
                  )}
                  {/* Poke / event highlights at top */}
                  {(active?.logs ?? []).slice(-4).map((l, i) => (
                    <div key={`log-${l.ts}-${i}`} className="msg event-line">
                      <span className="from">{l.event === 'join' ? '»' : '«'}</span>
                      <span>{logText(l)}</span>
                      <span className="time">{formatTime(l.ts)}</span>
                    </div>
                  ))}
                  {active?.messages.map((m, i) => {
                    const isNew = i >= chatAnimBase
                    const isWhisper = !!m.whisper
                    const isPoke = /\*poke\*/i.test(m.text)
                    return (
                      <div
                        key={`${m.fromId}-${m.ts}-${m.text.length}-${i}`}
                        className={`msg${isWhisper ? ' whisper-line' : ''}${isPoke ? ' poke-line' : ''}`}
                        style={
                          isNew
                            ? {
                                animationDelay: `${Math.min((i - chatAnimBase) * 45, 450)}ms`,
                              }
                            : { animation: 'none' }
                        }
                      >
                        {isPoke && <span className="label">戳一戳提醒</span>}
                        <span className="from">{m.from}</span>
                        {isWhisper && <span className="badge tertiary">耳语</span>}
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
                  aria-label="消息目标"
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
                        pmTarget: e.target.value ? Number(e.target.value) : null,
                      })
                    }}
                    disabled={!connected}
                    aria-label="私聊对象"
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
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={
                    connected
                      ? `发送到频道 #${channelName}…`
                      : '连接后可发送'
                  }
                  disabled={!connected}
                  aria-label="消息输入"
                />
                <button
                  type="button"
                  className="send-btn"
                  onClick={handleSend}
                  disabled={!connected}
                  aria-label="发送"
                  title="发送"
                >
                  <IcCheck size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="chat-log events-log">
              <div className="events-head">
                <h3>客户端信息</h3>
                <span className="activity-hint">{channelDesc.slice(0, 40)}…</span>
              </div>
              {!active?.logs.length && (
                <div className="empty">暂无活动</div>
              )}
              {(active?.logs.length ? active.logs : recentLogs).map((e, i) => (
                <div key={`${e.ts}-${i}`} className="msg event-line">
                  <span className="from">
                    {e.event === 'join' ? '»' : e.event === 'leave' ? '«' : '·'}
                  </span>
                  <span>{logText(e)}</span>
                  <span className="time">{formatTime(e.ts)}</span>
                </div>
              ))}
              {focusMember && (
                <div className="msg">
                  <span className="from">焦点</span>
                  <span>
                    {focusMember.nickname} · {statusFor(focusMember).text}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ===== Control Dock ===== */}
      <footer className="control-dock">
        <div className="dock-user">
          <button
            type="button"
            className={`dock-mic${muted ? ' off' : ''}${uplink ? ' uplink' : ''}`}
            onClick={toggleMute}
            title={muted ? '取消静音（Ctrl+M）' : '静音麦克风（Ctrl+M）'}
            aria-pressed={muted}
          >
            {muted || !mic.state.micOn ? (
              <IcMicOff size={16} />
            ) : (
              <IcMic size={16} />
            )}
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
                    : mic.state.vox.mode === 'vox'
                      ? '声控开启'
                      : mic.state.vox.mode === 'ptt'
                        ? '按键通话'
                        : '常开'
                : '麦克风已关闭'}
            </span>
          </div>
        </div>
        <div className={`dock-ptt${uplink ? ' engaged' : ''}`}>
          <span className="ptt-dot" style={{ background: uplink ? 'var(--tertiary)' : 'var(--ok)' }} />
          {uplink ? '按键发射中' : '语音活动'}
          <kbd>{mic.keyLabel(mic.state.vox.pttKey) || '空格'}</kbd>
        </div>
        <div className="dock-center">
          <div className="dock-vu">
            <span className="vu-label">输入电平</span>
            <VuMini level={muted ? 0 : meterLevel} />
            <span className="vu-db">
              {muted
                ? '已静音'
                : `${Math.round(meterLevel * 40 - 40) || -60} dB`}
            </span>
          </div>
          <span className="dock-meta">
            编码: <span className="g">OPUS 超低延迟</span> ·{' '}
            <span className="g">100% 音质</span>
          </span>
        </div>
        <div className="dock-actions">
          <button
            type="button"
            className={`dock-btn mic-btn${muted ? ' muted' : ' live'}`}
            onClick={toggleMute}
            aria-pressed={muted}
            title={muted ? '点击取消静音' : '点击静音麦克风'}
          >
            {muted || !mic.state.micOn ? (
              <IcMicOff size={14} />
            ) : (
              <IcMic size={14} />
            )}
            {muted ? '已静音' : '麦克风'}
          </button>
          <button
            type="button"
            className={`dock-btn${deafened ? ' on' : ''}`}
            onClick={toggleDeafen}
            aria-pressed={deafened}
            title="闭听"
          >
            <IcHeadset size={14} />
            声音
          </button>
          <button type="button" className="dock-btn" onClick={() => setSideTab('chat')} title="耳语列表">
            <IcShieldPerson size={14} />
            耳语列表 [F]
          </button>
        </div>
      </footer>

      <nav className="mobile-tabbar" aria-label="移动端导航">
        <button type="button" className={mobileTab === 'tree' ? 'active' : ''} onClick={() => setMobileTab('tree')}>
          频道
        </button>
        <button type="button" className={mobileTab === 'voice' ? 'active' : ''} onClick={() => setMobileTab('voice')}>
          语音
        </button>
        <button type="button" className={mobileTab === 'chat' ? 'active' : ''} onClick={() => setMobileTab('chat')}>
          信息
          {newMsgCount > 0 && (
            <span className="side-badge">{newMsgCount > 99 ? '99+' : newMsgCount}</span>
          )}
        </button>
      </nav>
    </>
  )
}

function VuMini({ level }: { level: number }) {
  const n = 10
  const on = Math.round(Math.max(0, Math.min(1, level)) * n)
  return (
    <div className="vu-bars" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i
          key={i}
          className={
            i < on ? (i >= n - 2 ? 'clip' : i >= n - 4 ? 'hot' : 'on') : ''
          }
        />
      ))}
    </div>
  )
}

/* ---------- Tree ---------- */

interface ChannelTreeProps {
  channels: ChannelNode[]
  selfId: number | null
  activeChannelId: number | null
  selectedChannelId: number | null
  onSelect: (id: number | null) => void
  onJoin: (id: number) => void
  onClientMenu: (client: ClientInfo, e: React.MouseEvent) => void
  collapsed: Set<number>
  onToggleCollapse: (id: number) => void
  filter: string
  lat: (c: ClientInfo) => number | string
  statusFor: (c: ClientInfo) => { text: string; kind: StatusKind }
}

function ChannelTree({
  channels,
  selfId,
  activeChannelId,
  selectedChannelId,
  onSelect,
  onJoin,
  onClientMenu,
  collapsed,
  onToggleCollapse,
  filter,
  lat,
  statusFor,
}: ChannelTreeProps) {
  const q = filter.trim().toLowerCase()

  const match = (n: ChannelNode): boolean => {
    if (!q) return true
    if (n.name.toLowerCase().includes(q)) return true
    return (n.clients ?? []).some((c) => c.nickname.toLowerCase().includes(q))
  }

  const roots = channels.filter((n) => n.parentId == null)
  const childrenOf = (id: number) => channels.filter((n) => n.parentId === id)

  const renderNode = (n: ChannelNode, depth: number): React.ReactNode => {
    if (!match(n) && childrenOf(n.id).every((c) => !match(c))) return null
    const kids = childrenOf(n.id)
    const isOpen = !collapsed.has(n.id)
    const isActive = n.id === activeChannelId
    const isSelected = n.id === selectedChannelId
    const cl = n.clients ?? []
    const clientCount = cl.length
    const isMax = n.maxClients != null && n.maxClients > 0 && clientCount >= n.maxClients
    return (
      <div key={n.id} data-channel-id={n.id} style={{ position: 'relative' }}>
        <div
          className="channel"
          style={isActive ? { background: 'transparent' } : isSelected ? { background: 'rgba(30,31,38,0.6)' } : undefined}
        >
          <button
            type="button"
            className={`channel-head${isActive ? ' active' : ''}`}
            style={isActive ? { background: 'var(--surface-base)', color: 'var(--primary)' } : undefined}
            onClick={() => {
              onSelect(n.id)
              onJoin(n.id)
            }}
            title={`${n.name}${clientCount ? ` · ${clientCount} 人` : ''}`}
          >
            {kids.length > 0 ? (
              <span
                className="channel-icon collapse-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleCollapse(n.id)
                }}
                role="button"
                tabIndex={0}
                aria-label={isOpen ? '折叠' : '展开'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onToggleCollapse(n.id)
                  }
                }}
              >
                {isOpen ? '▾' : '▸'}
              </span>
            ) : (
              <span className="channel-icon">
                <IcVolumeUp size={14} />
              </span>
            )}
            <span className="channel-name">{n.name}</span>
            {isMax ? (
              <span className="channel-meta max">
                {clientCount}/{n.maxClients} MAX
              </span>
            ) : (
              <span className="channel-meta">
                {clientCount}
                {n.maxClients != null ? `/${n.maxClients}` : ''}
              </span>
            )}
          </button>
        </div>
        {(cl.length > 0 || kids.length > 0) && (
          <div className={depth === 0 ? 'clients' : 'clients'} style={depth === 0 ? { paddingLeft: 16 } : undefined}>
            {cl.map((c) => {
              const st = statusFor(c)
              const isSelf = c.id === selfId
              return (
                <div
                  key={c.id}
                  className={`client${st.kind === 'talking' ? ' talking' : ''}${isSelf ? ' me' : ''}${st.kind === 'muted' ? ' muted' : ''}`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onClientMenu(c, e)
                  }}
                >
                  <span className="client-dot" />
                  <span className="client-name">{c.nickname}</span>
                  <span className="client-flags">
                    {st.kind === 'muted' && <IcMicOff size={12} style={{ color: 'var(--error)' }} />}
                    {st.kind === 'listen' && <IcHeadsetOff size={12} style={{ color: 'var(--error)' }} />}
                    {isSelf && <IcShieldPerson size={12} style={{ color: 'var(--primary)' }} />}
                    {st.kind === 'talking' && <IcPriority size={12} />}
                    <span className="client-lat">{lat(c)}ms</span>
                  </span>
                </div>
              )
            })}
            {isOpen && kids.map((k) => renderNode(k, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const shown = roots.map((r) => renderNode(r, 0)).filter(Boolean)
  if (shown.length === 0 && q) {
    return <div className="empty">无匹配频道或成员</div>
  }
  return <div className="tree">{shown}</div>
}
