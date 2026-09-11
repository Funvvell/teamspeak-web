import { createTs3Adapter } from '../gateway/src/protocol/ts3-adapter.ts'

const host = process.env.TS_HOST || process.argv[2]
const port = Number(process.env.TS_PORT || process.argv[3] || 9987)
const nick = process.env.TS_NICK || 'TSWebSmoke'
const password = process.env.TS_PASSWORD || undefined

if (!host) {
  console.error('Usage: node --import tsx scripts/smoke-ts3-connect.ts <host> [port]')
  process.exit(2)
}

const msgs = []
const adapter = createTs3Adapter((m) => {
  msgs.push(m)
  if (m.type === 'status' || m.type === 'error' || m.type === 'message') {
    console.log('<-', JSON.stringify(m).slice(0, 200))
  }
})

console.log(`Connecting to ${host}:${port} as ${nick} ...`)
const t0 = Date.now()
try {
  const info = await adapter.connect({ host, port, nickname: nick, password })
  console.log('CONNECTED', {
    ms: Date.now() - t0,
    name: info.name,
    selfId: info.selfId,
    welcome: String(info.welcome).slice(0, 80),
  })
  const tree = adapter.getChannelTree()
  const validIds = tree.filter((c) => c.id > 0).length
  console.log(
    'channels',
    tree.length,
    'validIds',
    validIds,
    tree
      .filter((c) => c.id > 0)
      .slice(0, 8)
      .map(
        (c) =>
          `${c.id}:${c.name}(parent=${c.parentId},max=${c.maxClients},n=${c.clients.length})`,
      ),
  )
  const clients = adapter.getClients()
  console.log(
    'clients',
    clients.length,
    clients.slice(0, 8).map((c) => `${c.id}:${c.nickname}@${c.channelId}`),
  )
  await adapter.sendText('channel', 'hello from teamspeak-web smoke test')
  console.log('sent channel message')
  await new Promise((r) => setTimeout(r, 1500))
  await adapter.disconnect()
  console.log('PASS')
  process.exit(0)
} catch (err) {
  console.error('FAIL', err instanceof Error ? err.message : err)
  try {
    await adapter.disconnect()
  } catch {
    /* ignore */
  }
  process.exit(1)
}
