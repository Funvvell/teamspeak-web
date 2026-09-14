import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { Session } from './session'
import { createMockAdapter } from './protocol/mock-adapter'
import { createTs3Adapter } from './protocol/ts3-adapter'
import type { AdapterFactory } from './protocol/adapter'

process.on('uncaughtException', (err) => {
  console.error('[gateway] uncaughtException', err)
  process.exit(1)
})
process.on('unhandledRejection', (err) => {
  console.error('[gateway] unhandledRejection', err)
  process.exit(1)
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 8080)
const HOST = process.env.HOST || '0.0.0.0'
const PROTOCOL = (process.env.PROTOCOL || 'ts3').toLowerCase()
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || ''
const DEFAULT_HOST = process.env.DEFAULT_HOST || ''
const DEFAULT_PORT = process.env.DEFAULT_PORT || '9987'
const DEFAULT_NICKNAME = process.env.DEFAULT_NICKNAME || ''
const STARTED_AT = Date.now()
// WS 帧载荷上限（语音帧约几 KB，1 MiB 足够；防止恶意超长帧耗尽内存）
const MAX_PAYLOAD = Number(process.env.MAX_PAYLOAD || 1024 * 1024)
// 并发 WS 连接上限（每连接一个 TS3 会话，防资源耗尽）
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS || 64)
const ALLOW_OPEN = process.env.ALLOW_OPEN === '1'

// Fail-closed: real TS3 protocol requires a gateway token unless explicitly allowed
if (PROTOCOL !== 'mock' && !GATEWAY_TOKEN && !ALLOW_OPEN) {
  console.error(
    '[gateway] GATEWAY_TOKEN is required when PROTOCOL=ts3. ' +
      'Set GATEWAY_TOKEN, or PROTOCOL=mock for local demo, or ALLOW_OPEN=1 to accept the risk.',
  )
  process.exit(1)
}

const createAdapter: AdapterFactory =
  PROTOCOL === 'mock' ? createMockAdapter : createTs3Adapter

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {
    // still burn a compare to reduce length signal
    crypto.timingSafeEqual(ab, ab)
    return false
  }
  return crypto.timingSafeEqual(ab, bb)
}

function checkHttpToken(req: http.IncomingMessage, url: URL): boolean {
  if (!GATEWAY_TOKEN) return true
  const q = url.searchParams.get('token')
  if (q && timingSafeEqualStr(q, GATEWAY_TOKEN)) return true
  const auth = req.headers.authorization || ''
  if (auth.startsWith('Bearer ') && timingSafeEqualStr(auth.slice(7), GATEWAY_TOKEN)) {
    return true
  }
  return false
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const raw = req.url || '/'
  const url = new URL(raw, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        protocol: PROTOCOL,
        uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
        authRequired: Boolean(GATEWAY_TOKEN),
      }),
    )
    return
  }

  if (pathname === '/config') {
    const authorized = checkHttpToken(req, url)
    const body: Record<string, unknown> = {
      authRequired: Boolean(GATEWAY_TOKEN),
      protocol: PROTOCOL,
      defaultPort: DEFAULT_PORT,
      musicBotUrl: (process.env.MUSIC_BOT_URL || '').trim(),
    }
    // Sensitive prefills only with a valid token (or open mode)
    if (authorized) {
      body.defaultHost = DEFAULT_HOST
      body.defaultNickname = DEFAULT_NICKNAME
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
    return
  }

  // Protect API-like paths when token is set; static assets stay open for login-less SPA load
  if (GATEWAY_TOKEN && pathname.startsWith('/api/')) {
    if (!checkHttpToken(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
  }

  let filePath = path.join(DIST, pathname === '/' ? 'index.html' : pathname)
  // Reject any path escaping dist/ — compare on path-segment boundary, not prefix
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html')
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(
      'dist/ not found. Run `npm run build` first, or use `npm run dev` for Vite + gateway.',
    )
    return
  }
  const ext = path.extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  const stream = fs.createReadStream(filePath)
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
  stream.pipe(res)
}

const server = http.createServer(serveStatic)
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (url.pathname !== '/ws') {
    socket.destroy()
    return
  }
  if (wss.clients.size >= MAX_CONNECTIONS) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  if (GATEWAY_TOKEN) {
    const q = url.searchParams.get('token')
    const auth = req.headers.authorization || ''
    const qOk = q !== null && timingSafeEqualStr(q, GATEWAY_TOKEN)
    const authOk =
      auth.startsWith('Bearer ') && timingSafeEqualStr(auth.slice(7), GATEWAY_TOKEN)
    if (!qOk && !authOk) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  const session = new Session(ws, createAdapter)
  ws.on('message', (raw, isBinary) => {
    session.handleRaw(isBinary ? (raw as Buffer) : String(raw))
  })
  ws.on('close', () => {
    void session.dispose()
  })
  ws.on('error', () => {
    void session.dispose()
  })
})

server.listen(PORT, HOST, () => {
  console.log(
    `[gateway] protocol=${PROTOCOL} auth=${GATEWAY_TOKEN ? 'token' : 'open'} http://${HOST}:${PORT} ws://${HOST}:${PORT}/ws`,
  )
  if (DEFAULT_HOST) {
    console.log(`[gateway] default server ${DEFAULT_HOST}:${DEFAULT_PORT}`)
  }
  if (!fs.existsSync(DIST)) {
    console.log(
      '[gateway] dist/ missing — frontend build not found (dev mode: open Vite on :5173)',
    )
  }
})
