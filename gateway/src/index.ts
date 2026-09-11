import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { Session } from './session'
import { createMockAdapter } from './protocol/mock-adapter'
import { createTs3Adapter } from './protocol/ts3-adapter'
import type { AdapterFactory } from './protocol/adapter'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 8080)
const HOST = process.env.HOST || '127.0.0.1'
const PROTOCOL = (process.env.PROTOCOL || 'ts3').toLowerCase()

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

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = (req.url || '/').split('?')[0]
  let filePath = path.join(DIST, url === '/' ? 'index.html' : url)
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
const wss = new WebSocketServer({ server, path: '/ws' })

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
    `[gateway] protocol=${PROTOCOL}  http://${HOST}:${PORT}  ws://${HOST}:${PORT}/ws`,
  )
  if (!fs.existsSync(DIST)) {
    console.log(
      '[gateway] dist/ missing — frontend build not found (dev mode: open Vite on :5173)',
    )
  }
})
