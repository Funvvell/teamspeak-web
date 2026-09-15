import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseHostPort,
  countryFlag,
  formatTime,
  loadVolumes,
  saveVolumes,
  loadCollapsed,
  saveCollapsed,
  loadRecent,
  saveRecent,
  LOG_ICON,
  LS_VOL,
} from './utils'
import { DEFAULT_VOICE_PORT } from '../../shared/types'

/** 简易 localStorage 替身（node 环境无 localStorage） */
function makeStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    _store: store,
  }
}

let ls: ReturnType<typeof makeStorage>

beforeEach(() => {
  ls = makeStorage()
  ;(globalThis as { localStorage: unknown }).localStorage = ls
})

describe('parseHostPort', () => {
  it('解析 host:port', () => {
    expect(parseHostPort('ts.example.com:9987')).toEqual({
      host: 'ts.example.com',
      port: '9987',
    })
  })

  it('无端口时使用默认 9987', () => {
    expect(parseHostPort('ts.example.com')).toEqual({
      host: 'ts.example.com',
      port: String(DEFAULT_VOICE_PORT),
    })
  })

  it('空串返回默认端口', () => {
    expect(parseHostPort('   ')).toEqual({
      host: '',
      port: String(DEFAULT_VOICE_PORT),
    })
  })

  it('非法端口回退为整串 host + 默认端口', () => {
    expect(parseHostPort('host:99999')).toEqual({
      host: 'host:99999',
      port: String(DEFAULT_VOICE_PORT),
    })
  })

  it('多冒号取最后一个作为端口分隔', () => {
    expect(parseHostPort('::1:9987')).toEqual({
      host: '::1',
      port: '9987',
    })
  })
})

describe('countryFlag', () => {
  it('已知国家码返回国旗 emoji', () => {
    expect(countryFlag('cn')).toBe('🇨🇳')
    expect(countryFlag('US')).toBe('🇺🇸')
  })

  it('未知/空值返回 null', () => {
    expect(countryFlag('XX')).toBeNull()
    expect(countryFlag(undefined)).toBeNull()
    expect(countryFlag('')).toBeNull()
  })
})

describe('formatTime', () => {
  it('返回包含时分的时间串', () => {
    const s = formatTime(Date.now())
    expect(typeof s).toBe('string')
    expect(s).toMatch(/\d{2}:\d{2}/)
  })
})

describe('volumes（含 legacy key 迁移）', () => {
  it('loadVolumes 将 legacy "id:nickname" 键迁移为数字 id', () => {
    ls.setItem(LS_VOL, JSON.stringify({ '1.2.3.4:9987': { '42:演示用户': 0.5, '7': 0.8, bad: 0.9 } }))
    const v = loadVolumes('1.2.3.4:9987')
    expect(v).toEqual({ '42': 0.5, '7': 0.8 })
  })

  it('loadVolumes 忽略非数字键', () => {
    ls.setItem(LS_VOL, JSON.stringify({ h: { abc: 0.1, '12:昵称': 0.2 } }))
    expect(loadVolumes('h')).toEqual({ '12': 0.2 })
  })

  it('saveVolumes 后 loadVolumes 可读回', () => {
    saveVolumes('h', { '1': 0.25, '2': 0.75 })
    expect(loadVolumes('h')).toEqual({ '1': 0.25, '2': 0.75 })
  })

  it('损坏 JSON 返回空对象', () => {
    ls.setItem(LS_VOL, 'not-json{{{')
    expect(loadVolumes('h')).toEqual({})
  })
})

describe('collapsed', () => {
  it('saveCollapsed / loadCollapsed 往返一致', () => {
    saveCollapsed(new Set([1, 2, 3]))
    expect(loadCollapsed()).toEqual(new Set([1, 2, 3]))
  })

  it('空/损坏数据返回空集合', () => {
    expect(loadCollapsed()).toEqual(new Set())
    ls.setItem('tsweb:collapsed', 'oops')
    expect(loadCollapsed()).toEqual(new Set())
  })
})

describe('recent', () => {
  it('saveRecent 截断到 3 条', () => {
    const list = Array.from({ length: 8 }, (_, i) => ({
      host: `h${i}`,
      port: '9987',
      label: `L${i}`,
      ts: i,
    }))
    saveRecent(list)
    expect(loadRecent()).toHaveLength(3)
  })

  it('loadRecent 过滤掉无 host 的脏数据', () => {
    ls.setItem('tsweb:recent', JSON.stringify([{ port: '1' }, { host: 'ok', port: '2' }, null]))
    expect(loadRecent().map((r) => r.host)).toEqual(['ok'])
  })
})

describe('LOG_ICON', () => {
  it('六种事件均有图标', () => {
    for (const ev of ['join', 'leave', 'move', 'connect', 'disconnect', 'poke'] as const) {
      expect(LOG_ICON[ev].length).toBeGreaterThan(0)
    }
  })
})
