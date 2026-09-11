import { generateIdentity } from '@honeybbq/teamspeak-client'

const t0 = Date.now()
const id = generateIdentity(8)
const ms = Date.now() - t0
console.log(JSON.stringify({
  ok: true,
  ms,
  level: id.securityLevel(),
  uidPreview: id.toString().slice(0, 40) + '...',
}, null, 2))
