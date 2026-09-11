import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { Session } from './session'
import { createMockAdapter } from './protocol/mock-adapter'
import { createTs3Adapter } from './protocol/ts3-adapter'
import type { AdapterFactory } from './protocol/adapter'

process.on('uncaughtException', (err) => {
  console.error('[gateway] uncaughtException', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[gateway] unhandledRejection', err)
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

function checkHttpToken(req: http.IncomingMessage, url: URL): boolean {
  if (!GATEWAY_TOKEN) return true
  const q = url.searchParams.get('token')
  if (q && q === GATEWAY_TOKEN) return true
  const auth = req.headers.authorization || ''
  if (auth === `Bearer ${GATEWAY_TOKEN}`) return true
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
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        defaultHost: DEFAULT_HOST,
        defaultPort: DEFAULT_PORT,
        defaultNickname: DEFAULT_NICKNAME,
        authRequired: Boolean(GATEWAY_TOKEN),
        protocol: PROTOCOL,
      }),
    )
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
  if (!filePath.startsWith(DIST)) {
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
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(serveStatic)
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (url.pathname !== '/ws') {
    socket.destroy()
    return
  }
  if (GATEWAY_TOKEN) {
    const q = url.searchParams.get('token')
    const auth = req.headers.authorization || ''
    if (q !== GATEWAY_TOKEN && auth !== `Bearer ${GATEWAY_TOKEN}`) {
      // Allow first-message auth: accept upgrade, Session will reject
      // Prefer URL token for simplicity — reject here if neither present
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
