import type {
  ClientToGateway,
  GatewayToClient,
} from '../../shared/types'

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export function createGatewayClient(handlers: {
  onMessage: (msg: GatewayToClient) => void
  onSocketStatus: (s: WsStatus, detail?: string) => void
  /** Binary audio frame from gateway */
  onAudioFrame?: (data: ArrayBuffer) => void
}) {
  let ws: WebSocket | null = null
  let queue: Array<string | ArrayBuffer | Uint8Array> = []

  function send(msg: ClientToGateway) {
    const payload = JSON.stringify(msg)
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      queue.push(payload)
      return
    }
    ws.send(payload)
  }

  function sendAudio(frame: Uint8Array) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(frame)
  }

  function connectSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${location.host}/ws`
    handlers.onSocketStatus('connecting')
    ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      handlers.onSocketStatus('open')
      for (const item of queue) ws?.send(item)
      queue = []
    }
    ws.onmessage = (ev) => {
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
    ws.onerror = () => {
      handlers.onSocketStatus('error', 'WebSocket error')
    }
    ws.onclose = () => {
      handlers.onSocketStatus('closed')
      ws = null
    }
  }

  return {
    start: connectSocket,
    send,
    sendAudio,
    close() {
      queue = []
      ws?.close()
      ws = null
    },
  }
}
