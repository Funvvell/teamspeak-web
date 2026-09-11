import WebSocket from 'ws'

const url = process.env.WS_URL || 'ws://127.0.0.1:8080/ws'
const host = process.argv[2] || 'ts.example.com'
const port = Number(process.argv[3] || 9987)
const nick = process.argv[4] || 'WebProbe'

const ws = new WebSocket(url)
const t0 = Date.now()
const timeout = setTimeout(() => {
  console.error('TIMEOUT after', Date.now() - t0, 'ms — last messages above')
  process.exit(1)
}, 60000)

ws.on('open', () => {
  console.log('ws open', url)
  ws.send(JSON.stringify({ type: 'connect', host, port, nickname: nick }))
})

ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw))
  const extra =
    msg.type === 'status'
      ? msg.state + (msg.message ? ' | ' + msg.message : '')
      : msg.type === 'channel_tree'
        ? `channels=${msg.channels.length}`
        : msg.type === 'client_list'
          ? `clients=${msg.clients.length}`
          : msg.type === 'server_info'
            ? msg.name
            : msg.type === 'error'
              ? `${msg.code}: ${msg.message}`
              : ''
  console.log(`+${Date.now() - t0}ms`, msg.type, extra)

  if (msg.type === 'status' && msg.state === 'connected') {
    clearTimeout(timeout)
    console.log('PASS gateway connect in', Date.now() - t0, 'ms')
    ws.close()
    process.exit(0)
  }
  if (msg.type === 'status' && msg.state === 'error') {
    clearTimeout(timeout)
    console.error('FAIL gateway', msg.message)
    process.exit(1)
  }
  if (msg.type === 'error') {
    // keep waiting for status
  }
})

ws.on('error', (e) => {
  console.error('ws error', e.message)
  process.exit(1)
})
