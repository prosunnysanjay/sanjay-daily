import '@testing-library/jest-dom'
import { vi } from 'vitest'

// In-memory fake Postgres table standing in for Supabase, shared across tests in a file
export let fakeTable = []

export function resetFakeTable() {
  fakeTable = []
}

export const TEST_EMAIL = 'sanjaysunny078@gmail.com'
export const TEST_PASSWORD = 'test-password'
const FAKE_USER = { id: 'test-user-id', email: TEST_EMAIL }

let currentSession = null
let authListeners = []

export function resetFakeAuth() {
  currentSession = null
  authListeners = []
}

function notify(event, session) {
  authListeners.forEach((cb) => cb(event, session))
}

// A minimal stand-in for supabase-js's thenable query builder: every chain
// method mutates internal state and returns the same object, and the actual
// in-memory operation only runs when the chain is awaited (via `.then`) —
// this matches real supabase-js closely enough for storage.js's call shapes.
function makeQuery() {
  const state = { filters: [], limitN: null, single: false, mode: 'select', payload: null }

  const api = {
    select() {
      return api
    },
    eq(col, val) {
      state.filters.push((r) => r[col] === val)
      return api
    },
    like(col, pattern) {
      const clean = String(pattern).replace(/%/g, '')
      state.filters.push((r) => String(r[col] || '').startsWith(clean))
      return api
    },
    limit(n) {
      state.limitN = n
      return api
    },
    delete() {
      state.mode = 'delete'
      return api
    },
    upsert(payload) {
      state.mode = 'upsert'
      state.payload = payload
      return api
    },
    maybeSingle() {
      state.single = true
      return api
    },
    then(resolve, reject) {
      return run().then(resolve, reject)
    },
  }

  async function run() {
    if (state.mode === 'upsert') {
      const idx = fakeTable.findIndex((r) => r.key === state.payload.key)
      if (idx >= 0) fakeTable[idx] = { ...state.payload }
      else fakeTable.push({ ...state.payload })
      return { data: [state.payload], error: null }
    }
    if (state.mode === 'delete') {
      fakeTable = fakeTable.filter((r) => !state.filters.every((f) => f(r)))
      return { data: [], error: null }
    }
    let rows = fakeTable.filter((r) => state.filters.every((f) => f(r)))
    if (state.limitN != null) rows = rows.slice(0, state.limitN)
    if (state.single) return { data: rows[0] || null, error: null }
    return { data: rows, error: null }
  }

  return api
}

export const fakeSupabase = {
  from() {
    return makeQuery()
  },
  auth: {
    async getSession() {
      return { data: { session: currentSession } }
    },
    onAuthStateChange(cb) {
      authListeners.push(cb)
      return {
        data: {
          subscription: {
            unsubscribe() {
              authListeners = authListeners.filter((l) => l !== cb)
            },
          },
        },
      }
    },
    async signInWithPassword({ email, password }) {
      if (email === TEST_EMAIL && password === TEST_PASSWORD) {
        currentSession = { user: FAKE_USER, access_token: 'fake-token' }
        notify('SIGNED_IN', currentSession)
        return { data: { session: currentSession }, error: null }
      }
      return { data: { session: null }, error: { message: 'Invalid login credentials' } }
    },
    async getUser() {
      if (!currentSession) return { data: { user: null }, error: { message: 'Not signed in' } }
      return { data: { user: currentSession.user }, error: null }
    },
  },
}

global.alert = vi.fn()
global.confirm = vi.fn(() => true)
