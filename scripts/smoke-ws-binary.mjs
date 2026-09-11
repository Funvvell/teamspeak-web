import WebSocket from 'ws'

const url = process.env.WS_URL || 'ws://127.0.0.1:8080/ws'
const ws = new WebSocket(url)

const timeout = setTimeout(() => {
  console.error('TIMEOUT')
  process.exit(1)
}, 8000)

ws.on('open', () => {
  ws.send(
    JSON.stringify({
      type: 'connect',
      host: '127.0.0.1',
      port: 9987,
      nickname: 'BinSmoke',
    }),
  )
})

ws.on('message', (raw, isBinary) => {
  if (isBinary) {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    console.log('<- binary', buf.length, 'bytes opcode=', buf[0], 'codec=', buf[1])
    clearTimeout(timeout)
    console.log('PASS binary frame routed')
    ws.close()
    process.exit(0)
    return
  }
  const msg = JSON.parse(String(raw))
  console.log('<-', msg.type, msg.state ?? '')
  if (msg.type === 'status' && msg.state === 'connected') {
    // Send binary audio frame: [1][4][dummy opus]
    const payload = Buffer.from([1, 4, 0x00, 0x01, 0x02])
    ws.send(payload)
    console.log('-> binary audio frame sent')
  }
})

ws.on('error', (err) => {
  console.error('ERR', err.message)
  process.exit(1)
})
