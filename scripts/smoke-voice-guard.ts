import { createTs3Adapter } from '../gateway/src/protocol/ts3-adapter.ts'

const adapter = createTs3Adapter(() => {})
adapter.sendVoice(new Uint8Array([1, 2, 3]), 4)
await adapter.disconnect()
adapter.sendVoice(new Uint8Array([0x78, 0x9c]), 4)
adapter.sendVoice(new Uint8Array(0), 4)
console.log('PASS sendVoice guard')
