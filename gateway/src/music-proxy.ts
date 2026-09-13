/**
 * Music bot reverse proxy.
 *
 * Proxies `/music/api/*` (REST) and `/music/ws` (realtime) to the TSMusicBot
 * web API so the React music panel can talk to the bot on the same origin as
 * the gateway (no CORS, same session cookie domain).
 *
 * Env:
 *   MUSIC_BOT_URL  — e.g. http://127.0.0.1:3000. Empty disables the proxy.
 *
 * Notes:
 *   - The bot's CSRF check compares Origin/Referer host with the request Host,
 *     so we rewrite those headers to the bot's own origin on the way through.
 *   - Session cookie set by the bot (`Set-Cookie`) passes through untouched,
 *     so the browser stores it for the gateway origin (same-origin proxy).
 *   - WebSocket path is forwarded with a raw HTTP upgrade; binary frames are
 *     piped verbatim in both directions.
 */
import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

const MUSIC_BOT_URL = (process.env.MUSIC_BOT_URL || '').trim().replace(/\/+$/, '')

function log(...args: unknown[]) {
  console.log('[music-proxy]', ...args)
}

export function musicEnabled(): boolean {
  return MUSIC_BOT_URL !== ''
}

export function musicBotUrl(): string {
  return MUSIC_BOT_URL
}

export function isMusicPath(pathname: string): boolean {
  if (MUSIC_BOT_URL === '') return false
  return pathname === '/music/ws' || pathname.startsWith('/music/api')
}

function targetUrl(pathname: string, search: string): URL {
  // /music/api/... -> /api/... ; /music/ws -> /ws
  const rest = pathname.replace(/^\/music/, '') || '/'
  return new URL(rest + search, MUSIC_BOT_URL)
}

/** Bot's own origin, used to satisfy its same-origin CSRF check. */
function botOrigin(): string {
  try {
    return new URL(MUSIC_BOT_URL).origin
  } catch {
    return MUSIC_BOT_URL
  }
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function cloneHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue
    if (v === undefined) continue
    out[k] = Array.isArray(v) ? v.join(', ') : String(v)
  }
  // Same-origin illusion for the bot's CSRF middleware.
  out['origin'] = botOrigin()
  out['referer'] = botOrigin() + '/'
  return out
}

export function handleMusicHttp(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  if (MUSIC_BOT_URL === '') {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'MUSIC_BOT_URL not configured' }))
    return
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const target = targetUrl(url.pathname, url.search)
  const headers = cloneHeaders(req.headers)
  headers['host'] = target.host

  const upstream = http.request(
    target,
    { method: req.method, headers },
    (upRes) => {
      const resHeaders: Record<string, string | string[]> = {}
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (HOP_BY_HOP.has(k)) continue
        resHeaders[k] = v as string | string[]
      }
      res.writeHead(upRes.statusCode || 502, resHeaders)
      upRes.pipe(res)
    },
  )
  upstream.on('error', (err) => {
    log('upstream error', String(err))
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'music bot unreachable', detail: String(err) }))
    } else {
      res.end()
    }
  })
  req.pipe(upstream)
}

/**
 * Forward a browser upgrade request for /music/ws to the bot's /ws by issuing
 * our own HTTP upgrade and piping raw bytes both ways.
 */
export function handleMusicWs(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  if (MUSIC_BOT_URL === '') {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const target = targetUrl(url.pathname, url.search)
  const headers = cloneHeaders(req.headers)
  headers['host'] = target.host

  const upstream = http.request(target, { method: 'GET', headers })
  upstream.on('upgrade', (upRes, upSocket, upHead) => {
    // Relay the 101 with the bot's chosen subprotocol.
    let resHead = 'HTTP/1.1 101 Switching Protocols\r\n'
    for (const [k, v] of Object.entries(upRes.headers)) {
      if (HOP_BY_HOP.has(k)) continue
      resHead += `${k}: ${Array.isArray(v) ? v.join(', ') : v}\r\n`
    }
    resHead += '\r\n'
    socket.write(resHead)
    if (upHead?.length) socket.write(upHead)
    upSocket.pipe(socket)
    socket.pipe(upSocket)
    socket.on('close', () => upSocket.destroy())
    upSocket.on('close', () => socket.destroy())
  })
  upstream.on('error', (err) => {
    log('ws upstream error', String(err))
    socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
    socket.destroy()
  })
  // Forward any bytes the browser sent in the same packet as the upgrade.
  if (head?.length) upstream.write(head)
  upstream.end()
}
