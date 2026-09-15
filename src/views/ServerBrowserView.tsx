import { useEffect, useMemo, useState } from 'react'
import {
  IcBookmark,
  IcCheck,
  IcGame,
  IcSearch,
  IcShield,
  IcStar,
  IcWifi,
  IcBolt,
} from '../components/TacIcons'

export interface ServerBrowserViewProps {
  catalog: {
    bookmarks: {
      id: string
      name: string
      host: string
      port: number
      note?: string
      nickname?: string
      gameTag?: string
    }[]
    recent?: { host: string; port: number; nickname?: string; ts: number }[]
  }
  onJoin: (host: string, port: number) => void
  onAddBookmark?: (name: string, host: string, port: number, nickname?: string) => void
  onRemoveBookmark?: (id: string) => void
  onRefresh?: () => void
  connected?: boolean
  currentHost?: string
  currentPort?: string
}

const GAME_FILTERS = ['全部', 'CS2', 'Valorant', 'Arma 3', 'DayZ', '模拟赛车'] as const

export function ServerBrowserView({
  catalog,
  onJoin,
  onAddBookmark,
  onRemoveBookmark,
  onRefresh,
  connected,
  currentHost,
  currentPort,
}: ServerBrowserViewProps) {
  const [query, setQuery] = useState('')
  const [game, setGame] = useState<string>('全部')
  const [, setFetched] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/catalog')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setFetched(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const bookmarks = useMemo(() => catalog.bookmarks ?? [], [catalog.bookmarks])
  const recent = useMemo(() => catalog.recent ?? [], [catalog.recent])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, {
      id: string
      name: string
      host: string
      port: number
      note?: string
      gameTag?: string
      kind: 'bookmark' | 'recent'
      bookmarkId?: string
    }>()
    for (const b of bookmarks) {
      map.set(`${b.host}:${b.port}`, {
        id: b.id,
        name: b.name,
        host: b.host,
        port: b.port,
        note: b.note,
        gameTag: b.gameTag,
        kind: 'bookmark',
        bookmarkId: b.id,
      })
    }
    for (const r of recent) {
      const k = `${r.host}:${r.port}`
      if (!map.has(k)) {
        map.set(k, {
          id: `rec-${k}`,
          name: r.nickname ? `${r.host} · ${r.nickname}` : r.host,
          host: r.host,
          port: r.port,
          note: '最近连接',
          kind: 'recent',
        })
      }
    }
    let list = [...map.values()]
    if (game !== '全部') {
      const tag = game === '模拟赛车' ? 'Sim Racing' : game
      list = list.filter(
        (r) =>
          r.gameTag === tag ||
          r.gameTag === game ||
          (game === 'Arma 3' && (r.gameTag === 'Arma 3' || r.gameTag === 'Arma3')),
      )
    }
    if (q) {
      list = list.filter((r) =>
        `${r.name} ${r.host} ${r.gameTag ?? ''} ${r.note ?? ''}`
          .toLowerCase()
          .includes(q),
      )
    }
    return list
  }, [bookmarks, recent, query, game])

  const activeHost = currentHost
  const activePort = currentPort

  return (
    <div className="sb-page">
      <div className="sb-page-inner">
        <section className="uplink-hud" aria-label="直连上行链路">
          <div className="uplink-head">
            <div className="uplink-title">
              <IcBolt size={18} style={{ color: 'var(--primary)' }} />
              <h2>战术直连上行链路</h2>
              <span className="badge muted" style={{ color: 'var(--tertiary)' }}>
                就绪 // OPUS_V2
              </span>
            </div>
            <div className="uplink-status">
              <span className="ok-dot" />
              <span>UDP 路由已激活</span>
              <span>默认端口: 9987</span>
            </div>
          </div>
          <p className="sb-hint">
            {connected
              ? `当前已连接 ${activeHost || '—'}:${activePort || '9987'} · 可从下方书签切换或加入`
              : '从书签/最近记录加入，或回到登录页使用快速直连表单'}
          </p>
          <div className="sb-quick-actions">
            <button type="button" className="ghost" onClick={onRefresh}>
              ↻ 刷新目录
            </button>
          </div>
        </section>

        <div className="sb-grid">
          <div className="sb-bookmarks">
            <div className="sb-panel-title">
              <div className="sb-panel-title-left">
                <span className="t">
                  <IcBookmark size={16} />
                </span>
                固定书签
              </div>
              {onAddBookmark && (
                <button
                  type="button"
                  className="sb-new-btn"
                  onClick={() => {
                    const name = window.prompt('书签名称', '我的服务器')
                    if (!name) return
                    const host = window.prompt('服务器地址', '127.0.0.1')
                    if (!host) return
                    const portRaw = window.prompt('端口', '9987')
                    const port = Number(portRaw) || 9987
                    onAddBookmark(name, host, port)
                  }}
                >
                  + 新建
                </button>
              )}
            </div>
            {bookmarks.length === 0 && (
              <div className="empty">暂无书签 — 可在连接后自动保存或点「新建」</div>
            )}
            {bookmarks.map((bm) => {
              const isActive =
                activeHost === bm.host && String(activePort) === String(bm.port)
              return (
                <div key={bm.id} className={`bm-card${isActive ? ' active' : ''}`}>
                  <div className="bm-top">
                    <div className="bm-identity">
                      <div className="bm-icon">
                        <IcWifi size={16} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="bm-name-row">
                          <span className="bm-name">{bm.name}</span>
                          {isActive && <span className="bm-pulse" />}
                        </div>
                        <div className="bm-host">
                          {bm.host}:{bm.port}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bm-meta">
                    <div className="left">
                      <IcCheck size={12} style={{ color: 'var(--tertiary)' }} />
                      <span className="t">{bm.note || bm.gameTag || '书签'}</span>
                    </div>
                  </div>
                  <div className="bm-actions">
                    <button type="button" onClick={() => onJoin(bm.host, bm.port)}>
                      {isActive ? '重新连接' : '连接'}
                    </button>
                    {onRemoveBookmark && (
                      <button
                        type="button"
                        className="sq"
                        title="删除书签"
                        onClick={() => onRemoveBookmark(bm.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="sb-directory">
            <div className="sb-filters">
              <div className="sb-filter-top">
                <div className="sb-search">
                  <span className="f-icon">
                    <IcSearch size={16} />
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="按名称、标签或服务器 IP 过滤…"
                    aria-label="搜索服务器"
                  />
                  {query && (
                    <button
                      type="button"
                      className="clear"
                      onClick={() => setQuery('')}
                      aria-label="清除"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="sb-game-tags">
                {GAME_FILTERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`game-tag${game === g ? ' active' : ''}`}
                    onClick={() => setGame(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="sb-count-row">
              <span>发现 {rows.length} 个节点</span>
              <span>
                来源: <span className="sort">书签 + 最近连接</span>
              </span>
            </div>

            <div className="server-list">
              {rows.length === 0 && (
                <div className="empty">
                  无匹配服务器 — 使用登录页快速直连，或新建书签
                </div>
              )}
              {rows.map((s) => {
                const isActive =
                  activeHost === s.host && String(activePort) === String(s.port)
                return (
                  <div key={s.id} className="server-row">
                    <div className="server-badge-num">
                      <IcGame size={14} />
                    </div>
                    <div className="server-info">
                      <div className="server-info-top">
                        <span className="server-info-name">{s.name}</span>
                        {s.gameTag && <span className="badge cyan">{s.gameTag}</span>}
                        {isActive && <span className="badge tertiary">已连接</span>}
                        {s.kind === 'recent' && (
                          <span className="badge muted">{s.note}</span>
                        )}
                      </div>
                      <div className="server-info-meta">
                        <span>
                          {s.host}:{s.port}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="star-btn"
                      aria-label="书签"
                      title={s.bookmarkId ? '已有书签' : '加入书签'}
                      onClick={() => {
                        if (!s.bookmarkId && onAddBookmark) {
                          onAddBookmark(s.name, s.host, s.port)
                        }
                      }}
                    >
                      <IcStar size={16} />
                    </button>
                    <button
                      type="button"
                      className="join-btn"
                      onClick={() => onJoin(s.host, s.port)}
                    >
                      {isActive ? '重连 →' : '加入 →'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function BrowserEmptyIcon() {
  return <IcShield size={20} />
}
