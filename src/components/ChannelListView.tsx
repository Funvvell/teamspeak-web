import type { ReactNode } from 'react'
import type { ChannelNode, ClientInfo } from '../../shared/types'
import { SpeakerIcon } from './icons'
import { countryFlag } from '../lib/utils'

export function ChannelListView({
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
}: {
  channels: ChannelNode[]
  selfId: number | null
  activeChannelId: number | null
  selectedChannelId: number | null
  onSelect: (id: number) => void
  onJoin: (id: number) => void
  onClientMenu: (client: ClientInfo, e: React.MouseEvent) => void
  collapsed: Set<number>
  onToggleCollapse: (id: number) => void
  filter: string
}) {
  if (!channels.length) {
    return <div className="empty">连接服务器后显示频道树</div>
  }

  const byParent = new Map<number | null, ChannelNode[]>()
  for (const ch of channels) {
    const list = byParent.get(ch.parentId) ?? []
    list.push(ch)
    byParent.set(ch.parentId, list)
  }

  // Filter: match channel name or member nickname, keep ancestor chain visible
  const q = filter.trim().toLowerCase()
  let visible: Set<number> | null = null
  if (q) {
    visible = new Set()
    const byId = new Map(channels.map((c) => [c.id, c]))
    for (const ch of channels) {
      const hit =
        ch.name.toLowerCase().includes(q) ||
        ch.clients.some((c) => c.nickname.toLowerCase().includes(q))
      if (hit) {
        let cur: ChannelNode | undefined = ch
        while (cur && !visible.has(cur.id)) {
          visible.add(cur.id)
          cur = cur.parentId != null ? byId.get(cur.parentId) : undefined
        }
      }
    }
    if (visible.size === 0) {
      return <div className="empty">无匹配频道</div>
    }
  }

  // Flat list of visible channels in display order (for keyboard nav)
  const flatVisible: number[] = []
  const collect = (parentId: number | null) => {
    let list = (byParent.get(parentId) ?? []).slice().sort((a, b) => {
      const ao = a.order ?? a.id
      const bo = b.order ?? b.id
      if (ao !== bo) return ao - bo
      return a.name.localeCompare(b.name)
    })
    if (visible) list = list.filter((ch) => visible.has(ch.id))
    for (const ch of list) {
      flatVisible.push(ch.id)
      const isOpen = visible ? true : !collapsed.has(ch.id)
      if (isOpen) collect(ch.id)
    }
  }
  collect(null)

  function onTreeKeyDown(e: React.KeyboardEvent) {
    if (!flatVisible.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const idx =
        selectedChannelId != null ? flatVisible.indexOf(selectedChannelId) : -1
      const next =
        e.key === 'ArrowDown'
          ? flatVisible[Math.min(idx + 1, flatVisible.length - 1)]
          : flatVisible[Math.max(idx - 1, 0)]
      onSelect(next ?? flatVisible[0])
    } else if (e.key === 'Enter' && selectedChannelId != null) {
      e.preventDefault()
      onJoin(selectedChannelId)
    }
  }

  function render(parentId: number | null, depth = 0): ReactNode {
    let list = (byParent.get(parentId) ?? []).slice().sort((a, b) => {
      const ao = a.order ?? a.id
      const bo = b.order ?? b.id
      if (ao !== bo) return ao - bo
      return a.name.localeCompare(b.name)
    })
    if (visible) list = list.filter((ch) => visible.has(ch.id))
    return list.map((ch) => {
      const isOpen = visible ? true : !collapsed.has(ch.id)
      const hasKids = (byParent.get(ch.id) ?? []).length > 0
      return (
        <li key={ch.id} style={{ marginLeft: depth ? depth * 10 : 0 }}>
          <div
            data-channel-id={ch.id}
            className={`channel${activeChannelId === ch.id ? ' active' : ''}${
              selectedChannelId === ch.id && activeChannelId !== ch.id
                ? ' selected'
                : ''
            }`}
          >
            <button
              type="button"
              className="channel-head"
              onClick={() => onSelect(ch.id)}
              onDoubleClick={() => onJoin(ch.id)}
            >
              <span className="channel-name">
                {hasKids ? (
                  <span
                    className="channel-icon collapse-btn"
                    title={isOpen ? '折叠' : '展开'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleCollapse(ch.id)
                    }}
                  >
                    {isOpen ? '▾' : '▸'}
                  </span>
                ) : (
                  <span className="channel-icon">
                    {ch.isDefault ? (
                      '⌂'
                    ) : (
                      <SpeakerIcon />
                    )}
                  </span>
                )}
                {hasKids && ch.isDefault && (
                  <span className="channel-icon">⌂</span>
                )}
                {ch.name}
              </span>
              <span className="channel-meta">
                {activeChannelId !== ch.id && (
                  <span className="channel-hint">双击加入</span>
                )}
                {ch.clients.length}/{ch.maxClients === 0 ? '∞' : ch.maxClients}
              </span>
            </button>
            {ch.clients.length > 0 && (
              <div className="clients">
                {ch.clients.map((c) => (
                  <div
                    key={c.id}
                    className={`client${c.id === selfId ? ' me' : ''}${
                      c.isTalking ? ' talking' : ''
                    }`}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      onClientMenu(c, e)
                    }}
                  >
                    <span className={`dot${c.isTalking ? ' talking' : ''}`} />
                    {c.isCommander && <span title="频道指挥官">★</span>}
                    {c.isAway && <span title="离开">🌙</span>}
                    {c.isInputMuted && <span title="输入已闭麦">🎤</span>}
                    {c.isOutputMuted && <span title="输出已闭麦">🔇</span>}
                    {c.country && (
                      <span title={c.country}>{countryFlag(c.country)}</span>
                    )}
                    <span>{c.nickname}</span>
                    {c.id === selfId && <span className="channel-meta">（我）</span>}
                    {c.isMuted && !c.isInputMuted && (
                      <span className="channel-meta" title="已静音">
                        🔇
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {isOpen && <ul className="tree">{render(ch.id, depth + 1)}</ul>}
        </li>
      )
    })
  }

  return (
    <ul className="tree" tabIndex={0} onKeyDown={onTreeKeyDown}>
      {render(null)}
    </ul>
  )
}
