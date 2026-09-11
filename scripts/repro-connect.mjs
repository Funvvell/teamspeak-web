import WebSocket from 'ws'

function oneConnect(label, delayMs = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const ws = new WebSocket('ws://127.0.0.1:8080/ws')
      const t0 = Date.now()
      const timer = setTimeout(() => {
        console.log(label, 'TIMEOUT 50s')
        try { ws.close() } catch {}
        resolve({ label, ok: false, ms: Date.now() - t0 })
      }, 50000)
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'connect',
          host: 'ts.example.com',
          port: 9987,
          nickname: 'Par' + label,
        }))
      })
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw))
        if (msg.type === 'status') {
          console.log(label, msg.state, msg.message || '', `+${Date.now() - t0}ms`)
          if (msg.state === 'connected' || msg.state === 'error' || msg.state === 'disconnected') {
            clearTimeout(timer)
            try { ws.close() } catch {}
            resolve({ label, ok: msg.state === 'connected', ms: Date.now() - t0, msg: msg.message })
          }
        }
      })
      ws.on('error', (e) => {
        clearTimeout(timer)
        console.log(label, 'ws error', e.message)
        resolve({ label, ok: false, ms: Date.now() - t0, err: e.message })
      })
    }, delayMs)
  })
}

const mode = process.argv[2] || 'seq'
if (mode === 'seq') {
  console.log('--- sequential ---')
  console.log(await oneConnect('A1', 0))
  await new Promise(r => setTimeout(r, 2000))
  console.log(await oneConnect('A2', 0))
} else {
  console.log('--- concurrent ---')
  const r = await Promise.all([oneConnect('B1', 0), oneConnect('B2', 300), oneConnect('B3', 600)])
  console.log(r)
}
