import '@testing-library/jest-dom'
import { vi } from 'vitest'

// In-memory fake Postgres table standing in for Supabase, shared across tests in a file
export let fakeTable = []

export function resetFakeTable() {
  fakeTable = []
}

export function installFakeFetch() {
  global.fetch = vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET'
    const u = new URL(url)
    const params = u.searchParams

    if (method === 'GET') {
      let rows = fakeTable
      const keyParam = params.get('key')
      if (keyParam && keyParam.startsWith('eq.')) {
        const wanted = decodeURIComponent(keyParam.slice(3))
        rows = rows.filter((r) => r.key === wanted)
      } else if (keyParam && keyParam.startsWith('like.')) {
        const pattern = decodeURIComponent(keyParam.slice(5)).replace(/\*/g, '')
        rows = rows.filter((r) => r.key.startsWith(pattern))
      }
      return {
        ok: true,
        status: 200,
        json: async () => rows.map((r) => ({ key: r.key, value: r.value })),
        text: async () => JSON.stringify(rows),
      }
    }
    if (method === 'POST') {
      const body = JSON.parse(options.body)
      body.forEach((item) => {
        const idx = fakeTable.findIndex((r) => r.key === item.key)
        if (idx >= 0) fakeTable[idx] = item
        else fakeTable.push(item)
      })
      return { ok: true, status: 201, json: async () => body, text: async () => JSON.stringify(body) }
    }
    if (method === 'DELETE') {
      const keyParam = params.get('key')
      const wanted = decodeURIComponent(keyParam.slice(3))
      fakeTable = fakeTable.filter((r) => r.key !== wanted)
      return { ok: true, status: 204, json: async () => [], text: async () => '' }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' }
  })
}

global.alert = vi.fn()
global.confirm = vi.fn(() => true)
