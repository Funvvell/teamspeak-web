import type {
  ChannelNode,
  ClientInfo,
  GatewayToClient,
} from '../../../shared/types'
import type { TsProtocolAdapter, VoiceFrame } from './adapter'

/** In-memory mock TS3 server for UI/gateway development. */
export function createMockAdapter(
  emit: (msg: GatewayToClient) => void,
): TsProtocolAdapter {
  let channels: ChannelNode[] = []
  let clients: ClientInfo[] = []
  let selfId = 1
  let nickname = 'Guest'
  let voiceHandlers = new Set<(f: VoiceFrame) => void>()
  const whisperClients = new Set<number>()
  const whisperChannels = new Set<number>()

  function rebuildTree(): ChannelNode[] {
    return channels.map((ch) => ({
      ...ch,
      clients: clients.filter((c) => c.channelId === ch.id),
    }))
  }

  function emitTree() {
    emit({ type: 'channel_tree', channels: rebuildTree() })
    emit({ type: 'client_list', clients })
  }

  return {
    async connect({ nickname: nick }) {
      nickname = nick || 'Guest'
      channels = [
        {
          id: 1,
          name: 'Lobby',
          parentId: null,
          maxClients: 32,
          isDefault: true,
          clients: [],
        },
        {
          id: 2,
          name: 'Gaming',
          parentId: null,
          maxClients: 16,
          isDefault: false,
          clients: [],
        },
        {
          id: 3,
          name: 'Squad A',
          parentId: 2,
          maxClients: 8,
          isDefault: false,
          clients: [],
        },
        {
          id: 4,
          name: 'AFK',
          parentId: null,
          maxClients: 64,
          isDefault: false,
          clients: [],
        },
      ]
      selfId = 1
      clients = [
        { id: selfId, nickname, channelId: 1, isTalking: false, isMuted: false },
        { id: 2, nickname: 'Alice', channelId: 1, isTalking: true, isMuted: false },
        { id: 3, nickname: 'Bob', channelId: 3, isTalking: false, isMuted: true },
      ]
      emitTree()
      emit({
        type: 'message',
        from: 'Server',
        fromId: 0,
        target: 'server',
        text: 'Welcome to TeamSpeak Web (mock mode).',
        ts: Date.now(),
      })
      return {
        name: 'Mock TS3 Server',
        welcome: 'Mock adapter — replace with real TS3 protocol.',
        selfId,
      }
    },

    async disconnect() {
      channels = []
      clients = []
    },

    async joinChannel(channelId: number) {
      const me = clients.find((c) => c.id === selfId)
      const target = channels.find((c) => c.id === channelId)
      if (!me || !target) {
        throw new Error(`Channel ${channelId} not found`)
      }
      me.channelId = channelId
      emitTree()
      emit({
        type: 'message',
        from: 'System',
        fromId: 0,
        target: 'server',
        text: `${nickname} joined ${target.name}`,
        ts: Date.now(),
      })
    },

    sendText(target, text) {
      const whisper = whisperClients.size > 0 || whisperChannels.size > 0
      const label =
        target === 'channel'
          ? 'channel'
          : target === 'server'
            ? 'server'
            : `client:${target.client}`
      emit({
        type: 'message',
        from: nickname,
        fromId: selfId,
        target: label,
        text: whisper ? `[耳语] ${text}` : text,
        ts: Date.now(),
        whisper,
      })
      if (target === 'channel') {
        const other = clients.find((c) => c.nickname === 'Alice')
        if (other) {
          emit({
            type: 'message',
            from: 'Alice',
            fromId: other.id,
            target: 'channel',
            text: `echo: ${text}`,
            ts: Date.now(),
          })
        }
      }
    },

    async poke(targetId, message) {
      emit({
        type: 'message',
        from: 'System',
        fromId: 0,
        target: 'server',
        text: `Poked #${targetId}${message ? ': ' + message : ''}`,
        ts: Date.now(),
      })
    },

    addWhisperTarget(target) {
      if (target.kind === 'client') whisperClients.add(target.id)
      else whisperChannels.add(target.id)
    },

    clearWhisperTargets() {
      whisperClients.clear()
      whisperChannels.clear()
    },

    getChannelTree: () => rebuildTree(),
    getClients: () => clients,

    sendVoice(data, codec = 4) {
      // Echo back so browser playback path can be exercised in mock mode
      const frame: VoiceFrame = { clientId: 2, codec, data }
      for (const h of voiceHandlers) h(frame)
      const alice = clients.find((c) => c.nickname === 'Alice')
      if (alice) {
        alice.isTalking = true
        emitTree()
        setTimeout(() => {
          alice.isTalking = false
          emitTree()
        }, 300)
      }
    },

    onVoice(handler) {
      voiceHandlers.add(handler)
      return () => voiceHandlers.delete(handler)
    },
  }
}
