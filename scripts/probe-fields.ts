import {
  Client,
  generateIdentity,
} from '@honeybbq/teamspeak-client'

const host = process.argv[2] || 'chenkr.cn'
const port = process.argv[3] || '9987'
const identity = generateIdentity(8)
const client = new Client(identity, port === '9987' ? host : `${host}:${port}`, 'TSWebProbe', {
  logger: {
    debug() {},
    info() {},
    warn() {},
    error() {},
  },
})
await client.connect()
await client.waitConnected(AbortSignal.timeout(20000))
const rows = await client.execCommandWithResponse('channellist -flags')
console.log('row keys sample:', Object.keys(rows[0] || {}))
console.log('first 3 rows:')
for (const r of rows.slice(0, 3)) {
  console.log(JSON.stringify(r, null, 0).slice(0, 500))
}
const cl = await client.execCommandWithResponse('clientlist')
console.log('client keys sample:', Object.keys(cl[0] || {}))
console.log('first client:', JSON.stringify(cl[0], null, 0).slice(0, 400))
await client.disconnect()
