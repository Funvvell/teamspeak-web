import type {
  ClientToGateway,
  GatewayToClient,
} from '../../shared/types'

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

const LS_TOKEN = 'tsweb:token'
/**
 * Cap of the offline send queue; oldest control messages are dropped when full.
 * Keeps reconnect bursts from unbounded growth if the socket stays down.
 */
const MAX_SEND_QUEUE = 100
/** Drop live voice when the socket send buffer backs up (keep latency low). */
const MAX_AUDIO_BUFFERED_BYTES = 64 * 1024

export function getGatewayToken() {
  return localStorage.getItem(LS_TOKEN) || ''
}

export function setGatewayToken(token: string) {
  if (token) localStorage.setItem(LS_TOKEN, token)
  else localStorage.removeItem(LS_TOKEN)
}

export function createGatewayClient(handlers: {
  onMessage: (msg: GatewayToClient) => void
  onSocketStatus: (s: WsStatus, detail?: string) => void
  onAudioFrame?: (data: ArrayBuffer) => void
}) {
  let ws: WebSocket | null = null
  let queue: Array<string | ArrayBuffer | Uint8Array> = []

  function detach(sock: WebSocket | null) {
    if (!sock) return
    sock.onopen = null
    sock.onmessage = null
    sock.onerror = null
    sock.onclose = null
  }

  function send(msg: ClientToGateway) {
    const payload = JSON.stringify(msg)
    // Open: send immediately — never drop while the socket is live.
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
      return
    }
    // Offline: queue, cap at MAX_SEND_QUEUE and drop the oldest control message.
    if (queue.length >= MAX_SEND_QUEUE) queue.shift()
    queue.push(payload)
  }

  function sendAudio(frame: Uint8Array) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    // Live voice: drop rather than grow an unbounded backlog on slow links.
    if (ws.bufferedAmount > MAX_AUDIO_BUFFERED_BYTES) return
    ws.send(frame)
  }

  function connectSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const token = getGatewayToken()
    // Auth: browser WebSocket cannot set Authorization headers, and the server
    // currently accepts `?token=` (and Authorization) on upgrade. Keep the query
    // path as the working transport. A future improvement may also pass
    // `new WebSocket(url, ['tsweb.bearer.' + base64url(token)])` as a subprotocol,
    // but only alongside the query fallback until the server is updated.
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    const url = `${proto}://${location.host}/ws${qs}`
    handlers.onSocketStatus('connecting')
    const sock = new WebSocket(url)
    ws = sock
    sock.binaryType = 'arraybuffer'
    sock.onopen = () => {
      if (ws !== sock) return
      handlers.onSocketStatus('open')
      for (const item of queue) sock.send(item)
      queue = []
    }
    sock.onmessage = (ev) => {
      if (ws !== sock) return
      if (ev.data instanceof ArrayBuffer) {
        handlers.onAudioFrame?.(ev.data)
        return
      }
      try {
        handlers.onMessage(JSON.parse(String(ev.data)) as GatewayToClient)
      } catch {
        handlers.onSocketStatus('error', 'Bad message from gateway')
      }
    }
    sock.onerror = () => {
      if (ws !== sock) return
      handlers.onSocketStatus('error', 'WebSocket error')
    }
    sock.onclose = () => {
      // Detach handlers so late events cannot re-enter after close.
      if (ws === sock) ws = null
      detach(sock)
      handlers.onSocketStatus('closed')
    }
  }

  return {
    // Reconnect policy lives in App (scheduleReconnect); this client is one-shot.
    start: connectSocket,
    send,
    sendAudio,
    close() {
      queue = []
      const sock = ws
      ws = null
      detach(sock)
      sock?.close()
    },
  }
}
