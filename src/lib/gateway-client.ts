import type {
  ClientToGateway,
  GatewayToClient,
} from '../../shared/types'

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export function createGatewayClient(handlers: {
  onMessage: (msg: GatewayToClient) => void
  onSocketStatus: (s: WsStatus, detail?: string) => void
}) {
  let ws: WebSocket | null = null
  let queue: string[] = []

  function send(msg: ClientToGateway) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      queue.push(JSON.stringify(msg))
      return
    }
    ws.send(JSON.stringify(msg))
  }

  function connectSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${location.host}/ws`
    handlers.onSocketStatus('connecting')
    ws = new WebSocket(url)
    ws.onopen = () => {
      handlers.onSocketStatus('open')
      for (const item of queue) ws?.send(item)
      queue = []
    }
    ws.onmessage = (ev) => {
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
    close() {
      queue = []
      ws?.close()
      ws = null
    },
  }
}
