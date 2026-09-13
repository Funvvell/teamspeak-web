/**
 * Music bot panel — controls a TSMusicBot instance through the gateway's
 * /music reverse proxy (same-origin, so the bot session cookie just works).
 *
 * Feature set: bot picker, now-playing card with progress seek, transport
 * controls, volume + play mode, search & enqueue, queue management, lyrics.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MusicIcon,
  PrevIcon,
  PlayIcon,
  PauseIcon,
  NextIcon,
  StopIcon,
} from './components/icons'

// ---- types (subset of the bot's API shapes) ----
interface Song {
  id: string
  name: string
  artist: string
  album: string
  duration: number
  coverUrl: string
  platform: string
  vip?: boolean
}

interface QueuedSong extends Song {
  requester?: string
  index?: number
}

interface BotStatus {
  id: string
  name: string
  connected: boolean
  playing: boolean
  paused: boolean
  currentSong: Song | null
  queueSize: number
  volume: number
  playMode: string
  elapsed: number
  effectiveDuration: number
}

interface SearchResult {
  songs: Song[]
  playlists?: { id: string; name: string; coverUrl: string; songCount: number; platform: string }[]
  albums?: { id: string; name: string; coverUrl: string; platform: string }[]
}

interface LyricLine {
  time: number
  text: string
}

const MODE_LABELS: Record<string, string> = {
  seq: '顺序',
  loop: '循环',
  random: '随机',
  rloop: '随机循环',
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T | { error?: string } }> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    return { ok: false, status: 0, data: { error: '无法连接音乐机器人服务' } }
  }
  let data: T | { error?: string } = {} as T
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data }
}

export function MusicPanel({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<'checking' | 'disabled' | 'auth' | 'ready'>('checking')
  const [user, setUser] = useState('')
  const [authError, setAuthError] = useState('')
  const [booting, setBooting] = useState(false)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const [bots, setBots] = useState<BotStatus[]>([])
  const [botId, setBotId] = useState('')
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [queue, setQueue] = useState<QueuedSong[]>([])

  const [providers, setProviders] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)

  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null)
  const [banner, setBanner] = useState('')
  const bootRef = useRef(false)

  // ---- stage detection: health + session ----
  const init = useCallback(async () => {
    const h = await api<{ ok?: boolean }>('/music/api/health')
    if (!h.ok) {
      setStage('disabled')
      return
    }
    const me = await api<{ username: string }>('/music/api/session/me')
    if (me.ok) {
      setUser((me.data as { username: string }).username || '')
      setStage('ready')
    } else {
      setStage('auth')
    }
  }, [])

  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true
    void init()
  }, [init])

  // ---- auth ----
  const doLogin = async () => {
    setAuthError('')
    const r = await api('/music/api/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (r.ok) {
      setUser(username)
      setStage('ready')
    } else {
      setAuthError((r.data as { error?: string }).error || '登录失败')
    }
  }

  const doSetup = async () => {
    setAuthError('')
    setBooting(true)
    const r = await api('/music/api/session/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    setBooting(false)
    if (r.ok) {
      setUser(username)
      setStage('ready')
    } else if (r.status === 409) {
      setAuthError('机器人已初始化过，请直接登录')
    } else {
      setAuthError((r.data as { error?: string }).error || '初始化失败')
    }
  }

  const doLogout = async () => {
    await api('/music/api/session/logout', { method: 'POST' })
    setUser('')
    setBots([])
    setBotId('')
    setStatus(null)
    setQueue([])
    setResult(null)
    setStage('auth')
  }

  // ---- bot list + status polling ----
  const loadBots = useCallback(async () => {
    const r = await api<{ bots: BotStatus[] }>('/music/api/bot')
    if (!r.ok) return
    const list = (r.data as { bots: BotStatus[] }).bots || []
    setBots(list)
    setBotId((prev) => {
      if (prev && list.some((b) => b.id === prev)) return prev
      return list[0]?.id || ''
    })
  }, [])

  const loadQueue = useCallback(async (id: string) => {
    if (!id) return
    const r = await api<{ queue: QueuedSong[]; status: BotStatus }>(
      `/music/api/player/${id}/queue`,
    )
    if (!r.ok) return
    const d = r.data as { queue: QueuedSong[]; status: BotStatus }
    setQueue(d.queue || [])
    setStatus(d.status || null)
  }, [])

  useEffect(() => {
    if (stage !== 'ready') return
    void loadBots()
  }, [stage, loadBots])

  useEffect(() => {
    if (!botId) return
    void loadQueue(botId)
    const t = window.setInterval(() => void loadQueue(botId), 3000)
    return () => window.clearInterval(t)
  }, [botId, loadQueue])

  // ---- providers ----
  useEffect(() => {
    if (stage !== 'ready') return
    void api<{ providers: string[] }>('/music/api/music/providers').then((r) => {
      if (r.ok) {
        const list = (r.data as { providers: string[] }).providers || []
        setProviders(list)
        setPlatform((p) => p || (list[0] === 'auto' ? '' : list[0] || ''))
      }
    })
  }, [stage])

  // ---- lyrics (when current song changes) ----
  const songId = status?.currentSong?.id
  useEffect(() => {
    setLyrics(null)
    if (!songId || !botId) return
    let dead = false
    const pl = status?.currentSong?.platform || ''
    void api<{ lyrics: unknown }>(
      `/music/api/music/lyrics/${encodeURIComponent(songId)}${pl ? `?platform=${encodeURIComponent(pl)}` : ''}`,
    ).then((r) => {
      if (dead || !r.ok) return
      const raw = (r.data as { lyrics: unknown }).lyrics
      if (Array.isArray(raw)) setLyrics(raw as LyricLine[])
    })
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, botId])

  // ---- commands ----
  const cmd = async (action: string, body?: Record<string, unknown>) => {
    if (!botId) return
    const r = await api(`/music/api/player/${botId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    if (!r.ok) setBanner((r.data as { error?: string }).error || '操作失败')
    void loadQueue(botId)
  }

  const playSong = (song: Song, immediate: boolean) =>
    void cmd(immediate ? 'play' : 'add', {
      query: `${song.name} ${song.artist}`.trim(),
      platform: song.platform,
    })

  const deleteQueue = async (index: number) => {
    if (!botId) return
    const r = await api(`/music/api/player/${botId}/queue/${index}`, { method: 'DELETE' })
    if (!r.ok) setBanner((r.data as { error?: string }).error || '移出失败')
    void loadQueue(botId)
  }

  const playPlaylist = (id: string, platformName: string) =>
    void cmd('play-playlist', { id, platform: platformName })

  const doSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    const params = new URLSearchParams({ q })
    if (platform) params.set('platform', platform)
    const r = await api<SearchResult>(`/music/api/music/search?${params}`)
    setSearching(false)
    setResult(r.ok ? (r.data as SearchResult) : null)
  }

  const seekTo = (frac: number) => {
    if (!status?.effectiveDuration) return
    void cmd('seek', { position: Math.round(frac * status.effectiveDuration) })
  }

  // ---- render ----
  const cur = status?.currentSong

  return (
    <div className="music-overlay">
      <div className="music-panel" role="dialog" aria-label="音乐机器人">
        <div className="music-head">
          <div className="music-title">
            <span className="music-title-icon">
              <MusicIcon />
            </span>
            <div>
              <h3>音乐机器人</h3>
              {stage === 'ready' && user && (
                <span className="music-user">
                  {user}
                  <button type="button" className="music-link" onClick={doLogout}>
                    退出
                  </button>
                </span>
              )}
            </div>
          </div>
          <button type="button" className="music-close" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        {stage === 'checking' && <div className="music-tip">正在连接音乐服务…</div>}

        {stage === 'disabled' && (
          <div className="music-tip">
            <p>音乐机器人服务未配置。</p>
            <p className="music-dim">
              在网关环境变量设置 <code>MUSIC_BOT_URL</code>（如
              http://127.0.0.1:3000）并部署 TSMusicBot 后刷新本页。
            </p>
          </div>
        )}

        {stage === 'auth' && (
          <div className="music-auth">
            <label className="field">
              <span className="field-label">机器人账号</span>
              <span className="input-wrap">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="首次使用请先初始化"
                  autoComplete="username"
                />
              </span>
            </label>
            <label className="field">
              <span className="field-label">密码</span>
              <span className="input-wrap">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onKeyDown={(e) => e.key === 'Enter' && void doLogin()}
                />
              </span>
            </label>
            {authError && <div className="field-error">{authError}</div>}
            <div className="music-auth-actions">
              <button
                type="button"
                className="music-btn music-btn-p music-btn-lg"
                onClick={doLogin}
                disabled={!username || !password}
              >
                登录
              </button>
              <button
                type="button"
                className="music-btn music-btn-lg"
                onClick={doSetup}
                disabled={!username || !password || booting}
              >
                {booting ? '初始化中…' : '首次配置'}
              </button>
            </div>
            <p className="muted music-auth-hint">
              账号由 TSMusicBot WebUI（
              <code>{window.location.origin.replace(/:\d+$/, '')}:3000</code>）创建，首次配置后即为管理员。
            </p>
          </div>
        )}

        {stage === 'ready' && (
          <div className="music-body">
            {banner && (
              <div className="music-banner">
                <span>{banner}</span>
                <button type="button" className="music-link" onClick={() => setBanner('')}>
                  ×
                </button>
              </div>
            )}

            {bots.length === 0 ? (
              <div className="music-tip">
                <p>还没有可用的音乐机器人。</p>
                <p className="music-dim">
                  请先在 TSMusicBot WebUI（
                  <code>{window.location.origin.replace(/:\d+$/, '')}:3000</code>）中创建并启动一个机器人。
                </p>
              </div>
            ) : (
              <>
                <div className="music-bot-row">
                  <span className="music-label">机器人</span>
                  <select value={botId} onChange={(e) => setBotId(e.target.value)}>
                    {bots.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name || b.id}
                        {b.connected ? ' · 在线' : ' · 离线'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* now playing */}
                <div className="now-card">
                  {cur ? (
                    <>
                      <div className="now-cover">
                        {cur.coverUrl ? (
                          <img src={cur.coverUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="now-cover-fallback">
                            <MusicIcon />
                          </span>
                        )}
                      </div>
                      <div className="now-meta">
                        <div className="now-name" title={cur.name}>
                          {cur.name}
                        </div>
                        <div className="now-artist" title={cur.artist}>
                          {cur.artist}
                          {cur.platform && <em>{cur.platform}</em>}
                        </div>
                        <div className="now-progress">
                          <input
                            type="range"
                            min={0}
                            max={1000}
                            value={
                              status.effectiveDuration > 0
                                ? Math.min(1000, (status.elapsed / status.effectiveDuration) * 1000)
                                : 0
                            }
                            onChange={(e) => seekTo(Number(e.target.value) / 1000)}
                            aria-label="播放进度"
                          />
                          <div className="now-time">
                            <span>{fmtTime(status.elapsed)}</span>
                            <span>{fmtTime(status.effectiveDuration)}</span>
                          </div>
                        </div>
                        <div className="now-controls">
                          <button
                            type="button"
                            className="transport"
                            onClick={() => void cmd('prev')}
                            title="上一首"
                          >
                            <PrevIcon />
                          </button>
                          <button
                            type="button"
                            className="transport primary"
                            onClick={() => void cmd(status.playing ? 'pause' : 'resume')}
                            title={status.playing ? '暂停' : '播放'}
                          >
                            {status.playing ? <PauseIcon /> : <PlayIcon />}
                          </button>
                          <button
                            type="button"
                            className="transport"
                            onClick={() => void cmd('next')}
                            title="下一首"
                          >
                            <NextIcon />
                          </button>
                          <button
                            type="button"
                            className="transport"
                            onClick={() => void cmd('stop')}
                            title="停止"
                          >
                            <StopIcon />
                          </button>
                        </div>
                        <div className="now-extras">
                          <div className="now-volume">
                            <span className="music-dim">音量</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={status.volume}
                              onChange={(e) =>
                                void cmd('volume', { volume: Number(e.target.value) })
                              }
                              aria-label="音量"
                            />
                            <b>{status.volume}</b>
                          </div>
                          <button
                            type="button"
                            className="mode-btn"
                            onClick={() => {
                              const order = ['seq', 'loop', 'random', 'rloop']
                              const next =
                                order[(order.indexOf(status.playMode) + 1) % order.length]
                              void cmd('mode', { mode: next })
                            }}
                            title="播放模式"
                          >
                            {MODE_LABELS[status.playMode] || status.playMode}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="now-empty">
                      <MusicIcon />
                      <p>未在播放</p>
                      <p className="music-dim">搜索歌曲点「播放」即可开始</p>
                    </div>
                  )}
                </div>

                {/* lyrics */}
                {lyrics && lyrics.length > 0 && cur && (
                  <div className="lyrics-box">
                    <div className="lyrics-title">歌词</div>
                    <div className="lyrics-scroll">
                      {lyrics.map((l, i) => {
                        const active = status.elapsed >= l.time && status.elapsed < (lyrics[i + 1]?.time ?? Infinity)
                        return (
                          <div key={i} className={`lyric-line${active ? ' active' : ''}`}>
                            {l.text}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* search */}
                <div className="music-search">
                  <div className="music-search-row">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索歌曲 / 歌单 / 专辑…"
                      onKeyDown={(e) => e.key === 'Enter' && void doSearch()}
                    />
                    {providers.length > 1 && (
                      <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                        <option value="">自动</option>
                        {providers.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="music-btn music-btn-p" onClick={doSearch} disabled={searching}>
                      {searching ? '…' : '搜索'}
                    </button>
                  </div>
                  {result && (
                    <div className="search-result">
                      {result.songs.length === 0 &&
                        (!result.playlists || result.playlists.length === 0) && (
                          <div className="music-dim">没有找到结果</div>
                        )}
                      {result.playlists && result.playlists.length > 0 && (
                        <div className="sr-group">
                          <div className="sr-head">歌单</div>
                          {result.playlists.map((pl) => (
                            <button
                              key={pl.id}
                              type="button"
                              className="sr-item"
                              onClick={() => playPlaylist(pl.id, pl.platform)}
                            >
                              {pl.coverUrl ? (
                                <img src={pl.coverUrl} alt="" loading="lazy" />
                              ) : (
                                <span className="sr-thumb-fallback">
                                  <MusicIcon />
                                </span>
                              )}
                              <span className="sr-main">
                                <span className="sr-name">{pl.name}</span>
                                <span className="sr-sub">{pl.songCount} 首</span>
                              </span>
                              <span className="sr-act">播放</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {result.songs.length > 0 && (
                        <div className="sr-group">
                          <div className="sr-head">歌曲</div>
                          {result.songs.map((song, i) => (
                            <div key={`${song.platform}:${song.id}`} className="sr-row">
                              <span className="sr-idx">{i + 1}</span>
                              <span className="sr-main">
                                <span className="sr-name">{song.name}</span>
                                <span className="sr-sub">
                                  {song.artist} · {fmtTime(song.duration)}
                                  {song.vip ? ' · VIP' : ''}
                                </span>
                              </span>
                              <span className="sr-acts">
                                <button type="button" className="music-link" onClick={() => playSong(song, true)}>
                                  播放
                                </button>
                                <button type="button" className="music-link" onClick={() => playSong(song, false)}>
                                  +队列
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* queue */}
                <div className="music-queue">
                  <div className="music-queue-head">
                    <span>播放队列</span>
                    {queue.length > 0 && (
                      <button type="button" className="music-link" onClick={() => void cmd('clear')}>
                        清空
                      </button>
                    )}
                  </div>
                  {queue.length === 0 ? (
                    <div className="muted music-queue-empty">队列为空</div>
                  ) : (
                    <div className="queue-list">
                      {queue.map((q, i) => {
                        const isCur = i === 0
                        return (
                          <div key={i} className={`queue-row${isCur ? ' current' : ''}`}>
                            <button
                              type="button"
                              className="queue-main"
                              onClick={() => !isCur && void cmd('play-at', { index: i })}
                            >
                              <span className="queue-idx">{isCur ? '▶' : i + 1}</span>
                              <span className="queue-meta">
                                <span className="queue-name">{q.name}</span>
                                <span className="queue-sub">
                                  {q.artist} · {fmtTime(q.duration)}
                                  {q.requester ? ` · ${q.requester}` : ''}
                                </span>
                              </span>
                            </button>
                            {!isCur && (
                              <button
                                type="button"
                                className="queue-del"
                                onClick={() => void deleteQueue(i)}
                                title="移出队列"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
