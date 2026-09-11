import {
  Client,
  identityFromString,
  listClients,
  sendTextMessage,
} from '@honeybbq/teamspeak-client'
import fs from 'node:fs'

const host = process.argv[2] || 'ts.example.com'
const port = process.argv[3] || '9987'
const nick = process.argv[4] || 'ProbeUser'

const identity = identityFromString(
  fs.readFileSync('gateway/data/identity.txt', 'utf8').trim(),
)
console.log('identity level', identity.securityLevel())

const client = new Client(
  identity,
  port === '9987' ? host : `${host}:${port}`,
  nick,
  { logger: { debug() {}, info() {}, warn() {}, error() {} } },
)

client.on('connected', () => console.log('event: connected'))
client.on('disconnected', (e) => console.log('event: disconnected', e?.message))
client.on('kicked', (r) => console.log('event: kicked', r))

try {
  console.log('connect()...')
  await client.connect()
  console.log('waitConnected 30s...')
  await client.waitConnected(AbortSignal.timeout(30_000))
  console.log('OK clid=', client.clientID(), 'cid=', client.channelID())

  try {
    const ch = await client.execCommandWithResponse('channellist -flags')
    console.log('channels', ch.length, ch.slice(0, 5).map((r) => `${r.cid}:${r.channel_name}`))
  } catch (e) {
    console.log('channellist FAIL', e.message)
  }

  try {
    const cl = await listClients(client)
    console.log('clients', cl.length, cl.slice(0, 5).map((c) => c.nickname))
  } catch (e) {
    console.log('listClients FAIL', e.message)
  }

  try {
    await sendTextMessage(client, 2, client.channelID(), 'probe hello')
    console.log('sendText OK')
  } catch (e) {
    console.log('sendText FAIL', e.message)
  }

  await client.disconnect()
  console.log('PASS')
  process.exit(0)
} catch (e) {
  console.error('FAIL', e?.message || e)
  try { await client.disconnect() } catch {}
  process.exit(1)
}
