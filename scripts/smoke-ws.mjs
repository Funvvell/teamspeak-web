import WebSocket from 'ws'

const url = process.env.WS_URL || 'ws://127.0.0.1:8080/ws'
const ws = new WebSocket(url)

const timeout = setTimeout(() => {
  console.error('TIMEOUT')
  process.exit(1)
}, 5000)

ws.on('open', () => {
  ws.send(
    JSON.stringify({
      type: 'connect',
      host: '127.0.0.1',
      port: 9987,
      nickname: 'Tester',
    }),
  )
})

const got = new Set()
const needed = new Set(['status', 'server_info', 'channel_tree', 'client_list', 'message'])

ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw))
  console.log('<-', msg.type, msg.state ?? msg.name ?? msg.from ?? '')
  got.add(msg.type)
  if (needed.has(msg.type)) needed.delete(msg.type)
  if (msg.type === 'status' && msg.state === 'connected') {
    ws.send(JSON.stringify({ type: 'join_channel', channelId: 3 }))
    ws.send(
      JSON.stringify({
        type: 'send_message',
        target: 'channel',
        text: 'hello from smoke test',
      }),
    )
  }
  if (needed.size === 0) {
    console.log('PASS: received', [...got].join(', '))
    clearTimeout(timeout)
    ws.close()
    process.exit(0)
  }
})

ws.on('error', (err) => {
  console.error('ERR', err.message)
  process.exit(1)
})
