import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  Bookmark,
  CatalogPayload,
  RecentEntry,
} from '../../shared/types'

export interface CatalogStore {
  list(): CatalogPayload
  addBookmark(b: Omit<Bookmark, 'id'>): Bookmark
  removeBookmark(id: string): boolean
  pushRecent(e: Omit<RecentEntry, 'ts'>): void
}

const MAX_RECENT = 3

function normalizeHost(host: string): string {
  let s = String(host || '').trim().toLowerCase()
  for (let i = 0; i < 8; i++) {
    const idx = s.lastIndexOf(':')
    if (idx <= 0) break
    const n = Number(s.slice(idx + 1))
    if (Number.isInteger(n) && n > 0 && n < 65536) {
      s = s.slice(0, idx).trim()
    } else {
      break
    }
  }
  return s
}

function normalizePort(port: number | string): number {
  const n = Number(port)
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 9987
}

function loadFile(file: string): { bookmarks: Bookmark[]; recent: RecentEntry[] } {
  try {
    if (!fs.existsSync(file)) return { bookmarks: [], recent: [] }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      bookmarks?: Bookmark[]
      recent?: RecentEntry[]
    }
    const bookmarks = (Array.isArray(raw.bookmarks) ? raw.bookmarks : [])
      .map((b) => ({
        ...b,
        host: normalizeHost(b.host || ''),
        port: normalizePort(b.port),
      }))
      .filter((b) => b.host)
    const seenBm = new Set<string>()
    const cleanBm = bookmarks.filter((b) => {
      const k = `${b.host}:${b.port}`
      if (seenBm.has(k)) return false
      seenBm.add(k)
      return true
    })

    const recentIn = Array.isArray(raw.recent) ? raw.recent : []
    const seenR = new Set<string>()
    const recent = recentIn
      .map((r) => ({
        ...r,
        host: normalizeHost(r.host || ''),
        port: normalizePort(r.port),
      }))
      .filter((r) => {
        if (!r.host) return false
        const k = `${r.host}:${r.port}`
        if (seenR.has(k)) return false
        seenR.add(k)
        return true
      })
      .slice(0, MAX_RECENT)

    return { bookmarks: cleanBm, recent }
  } catch {
    return { bookmarks: [], recent: [] }
  }
}

function defaultPath(): string {
  if (process.env.CATALOG_PATH) return process.env.CATALOG_PATH
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../data/catalog.json')
}

function saveFile(
  file: string,
  data: { bookmarks: Bookmark[]; recent: RecentEntry[] },
): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch (err) {
    console.warn(
      '[catalog] write failed',
      err instanceof Error ? err.message : err,
    )
    return false
  }
}

export function createCatalogStore(file = defaultPath()): CatalogStore {
  let { bookmarks, recent } = loadFile(file)
  if (bookmarks.length === 0) {
    // seed once so the tactical browser is not empty on first run
    bookmarks = [
      {
        id: 'seed-apex',
        name: 'Apex Masters 欧服中部',
        host: 'eu.apexmasters.gg',
        port: 9987,
        note: '自动加入（大厅 1）',
        autoJoin: true,
        gameTag: 'CS2',
      },
      {
        id: 'seed-tf141',
        name: 'Arma 战术 141 特遣队',
        host: 'tf141.milsim-voice.net',
        port: 9987,
        note: '已保存密码',
        gameTag: 'Arma 3',
      },
      {
        id: 'seed-gt3',
        name: 'Apex GT3 遥测通讯',
        host: 'racing.apex-voice.org',
        port: 10022,
        note: '麦克风自动衰减',
        gameTag: 'Sim Racing',
      },
    ]
    saveFile(file, { bookmarks, recent })
  }

  return {
    list() {
      return {
        bookmarks: bookmarks.slice(),
        recent: recent.slice(),
      }
    },
    addBookmark(b) {
      const host = normalizeHost(b.host)
      const port = normalizePort(b.port)
      const id = `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const bm: Bookmark = { ...b, id, host, port }
      bookmarks = [
        bm,
        ...bookmarks.filter((x) => !(x.host === bm.host && x.port === bm.port)),
      ].slice(0, 30)
      saveFile(file, { bookmarks, recent })
      return bm
    },
    removeBookmark(id) {
      const before = bookmarks.length
      bookmarks = bookmarks.filter((b) => b.id !== id)
      if (bookmarks.length === before) return false
      saveFile(file, { bookmarks, recent })
      return true
    },
    pushRecent(e) {
      const host = normalizeHost(e.host)
      if (!host) return
      const entry: RecentEntry = {
        ...e,
        host,
        port: normalizePort(e.port),
        ts: Date.now(),
      }
      recent = [
        entry,
        ...recent.filter(
          (r) => !(r.host === entry.host && r.port === entry.port),
        ),
      ].slice(0, MAX_RECENT)
      saveFile(file, { bookmarks, recent })
    },
  }
}
