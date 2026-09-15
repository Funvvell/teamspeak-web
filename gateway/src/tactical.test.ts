import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Bookmark } from '../../shared/types'
import { createCatalogStore } from './catalog'
import { createMockServerQuery } from './serverquery'

describe('catalog store', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsweb-catalog-'))
    file = path.join(dir, 'catalog.json')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('seeds default bookmarks and persists add/remove', () => {
    const store = createCatalogStore(file)
    const list = store.list()
    expect(list.bookmarks.length).toBeGreaterThan(0)
    expect(fs.existsSync(file)).toBe(true)

    const bm = store.addBookmark({
      name: '测试服',
      host: 'test.example.com',
      port: 9987,
    })
    expect(store.list().bookmarks.some((b: Bookmark) => b.id === bm.id)).toBe(true)
    expect(store.removeBookmark(bm.id)).toBe(true)
    expect(store.list().bookmarks.some((b: Bookmark) => b.id === bm.id)).toBe(false)
  })

  it('pushRecent caps and dedupes', () => {
    const store = createCatalogStore(file)
    for (let i = 0; i < 25; i++) {
      store.pushRecent({ host: `h${i % 3}.example.com`, port: 9987 })
    }
    const { recent } = store.list()
    expect(recent.length).toBeLessThanOrEqual(20)
  })
})

describe('mock serverquery', () => {
  it('connects and returns permission snapshot', async () => {
    const sq = createMockServerQuery()
    expect(sq.isConnected()).toBe(false)
    await sq.connect({
      host: 'mock',
      queryPort: 10011,
      username: 'admin',
      password: 'x',
    })
    expect(sq.isConnected()).toBe(true)
    const snap = await sq.getSnapshot([])
    expect(snap.tiers.length).toBeGreaterThan(0)
    expect(snap.tree.length).toBe(3)
    expect(snap.tree[0].items.length).toBeGreaterThan(0)
    expect(snap.audit[0]?.tag).toBe('sq_connect')
  })

  it('applies tier changes and updates audit', async () => {
    const sq = createMockServerQuery()
    await sq.connect({
      host: 'mock',
      queryPort: 10011,
      username: 'admin',
      password: 'x',
    })
    const n = await sq.applyTierChanges('100', [
      { key: 'b_client_kick_from_server', enabled: false },
    ])
    expect(n).toBe(1)
    const snap = await sq.getSnapshot([])
    expect(snap.audit.some((a) => a.tag === 'perm_edit')).toBe(true)
  })

  it('throws when not connected', async () => {
    const sq = createMockServerQuery()
    await expect(
      sq.applyTierChanges('100', [{ key: 'b_client_ban_create', enabled: true }]),
    ).rejects.toThrow(/未连接/)
  })
})
