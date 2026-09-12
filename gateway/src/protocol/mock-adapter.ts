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
  const voiceHandlers = new Set<(f: VoiceFrame) => void>()
  const talkingTimers = new Set<ReturnType<typeof setTimeout>>()
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
          name: '大厅',
          parentId: null,
          maxClients: 0,
          isDefault: true,
          order: 1,
          clients: [],
        },
        {
          id: 2,
          name: '研发讨论',
          parentId: null,
          maxClients: 20,
          isDefault: false,
          order: 2,
          clients: [],
        },
        {
          id: 3,
          name: '音乐房',
          parentId: null,
          maxClients: 10,
          isDefault: false,
          order: 3,
          clients: [],
        },
        {
          id: 4,
          name: '开黑五连',
          parentId: null,
          maxClients: 8,
          isDefault: false,
          order: 4,
          clients: [],
        },
        {
          id: 5,
          name: '游客接待',
          parentId: null,
          maxClients: 8,
          isDefault: false,
          order: 5,
          clients: [],
        },
        {
          id: 6,
          name: 'AFK 挂机',
          parentId: null,
          maxClients: 0,
          isDefault: false,
          order: 6,
          clients: [],
        },
      ]
      selfId = 1
      const C = (
        id: number,
        n: string,
        channelId: number,
        extra: Partial<ClientInfo> = {},
      ): ClientInfo => ({
        id,
        nickname: n,
        channelId,
        isTalking: false,
        isMuted: false,
        country: 'CN',
        latency: 30 + ((id * 13) % 70),
        ...extra,
      })
      clients = [
        C(selfId, nickname, 1, { latency: 42 }),
        C(2, '陈默', 1, { isInputMuted: true, latency: 68 }),
        C(3, '小满', 1, { isOutputMuted: true, latency: 42 }),
        C(4, '林知', 2, { latency: 58 }),
        C(5, '阿哲', 2, { latency: 36 }),
        C(6, '麦芽', 2, { latency: 91 }),
        C(7, '大橘', 2, { isAway: true, latency: 73 }),
        C(8, '回声', 2, { latency: 47 }),
        C(9, 'Moon', 3, { latency: 64 }),
        C(10, '云杉', 3, { latency: 51 }),
        C(11, '小鹿', 3, { latency: 39 }),
        C(12, '阿凯', 4, { latency: 44 }),
        C(13, '闪电', 4, { latency: 82 }),
        C(14, '馒头', 4, { latency: 55 }),
        C(15, '铁牛', 4, { latency: 61 }),
        C(16, '树懒', 6, { isAway: true, latency: 128 }),
        C(17, '化石', 6, { isAway: true, latency: 156 }),
      ]
      emitTree()
      emit({
        type: 'event_log',
        event: 'connect',
        nickname,
        ts: Date.now(),
      })
      emit({
        type: 'event_log',
        event: 'join',
        clientId: 4,
        nickname: '林知',
        channelId: 1,
        ts: Date.now(),
      })
      emit({
        type: 'event_log',
        event: 'move',
        clientId: 3,
        nickname: '小满',
        channelId: 3,
        detail: '音乐房',
        ts: Date.now() - 60_000,
      })
      emit({
        type: 'message',
        from: 'Server',
        fromId: 0,
        target: 'server',
        text: '欢迎回到 TeamSpeak Web（演示模式）。',
        ts: Date.now(),
      })
      return {
        name: '主服务器',
        welcome: '团队日常语音协作频道。发言前请确认麦克风状态；推荐使用声控（VOX）模式，需要专注时可闭听。',
        selfId,
      }
    },

    async disconnect() {
      for (const t of talkingTimers) clearTimeout(t)
      talkingTimers.clear()
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
        type: 'event_log',
        event: 'move',
        clientId: selfId,
        nickname,
        channelId,
        ts: Date.now(),
      })
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
        const other = clients.find((c) => c.id === 2)
        if (other) {
          emit({
            type: 'message',
            from: other.nickname,
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
      const peer = clients.find((c) => c.id === 2)
      if (peer) {
        peer.isTalking = true
        emitTree()
        const timer = setTimeout(() => {
          talkingTimers.delete(timer)
          peer.isTalking = false
          emitTree()
        }, 300)
        talkingTimers.add(timer)
      }
    },

    onVoice(handler) {
      voiceHandlers.add(handler)
      return () => voiceHandlers.delete(handler)
    },
  }
}
