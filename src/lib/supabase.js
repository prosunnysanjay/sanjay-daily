// Shared storage layer backed by Supabase, used by every tab component.
// Same get/set/delete/list shape as the old single-file version's shim,
// so each component's logic reads almost identically to before.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xrcpwknppvwujqsgrtqh.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_R37nWr-nLqdGQ3Wh56tctg_ek7TqgRl'
const REST_BASE = `${SUPABASE_URL}/rest/v1/app_storage`

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

export async function storageGet(key) {
  const url = `${REST_BASE}?key=eq.${encodeURIComponent(key)}&select=key,value`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`Supabase GET failed: ${res.status}`)
  const rows = await res.json()
  if (!rows.length) throw new Error('not found')
  return { key, value: JSON.stringify(rows[0].value) }
}

export async function storageSet(key, value) {
  let parsedValue
  try {
    parsedValue = JSON.parse(value)
  } catch {
    parsedValue = value
  }
  const url = `${REST_BASE}?on_conflict=key`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify([{ key, value: parsedValue, updated_at: new Date().toISOString() }]),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Supabase SET failed: ${res.status} ${errText}`)
  }
  return { key, value }
}

export async function storageDelete(key) {
  const url = `${REST_BASE}?key=eq.${encodeURIComponent(key)}`
  const res = await fetch(url, { method: 'DELETE', headers: headers() })
  if (!res.ok) throw new Error(`Supabase DELETE failed: ${res.status}`)
  return { key, deleted: true }
}

export async function storageList(prefix) {
  let url = `${REST_BASE}?select=key`
  if (prefix) url += `&key=like.${encodeURIComponent(prefix)}*`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`Supabase LIST failed: ${res.status}`)
  const rows = await res.json()
  return { keys: rows.map((r) => r.key), prefix }
}

export async function healthCheck() {
  try {
    const res = await fetch(`${REST_BASE}?select=key&limit=1`, { headers: headers() })
    return { ok: res.ok, status: res.status }
  } catch (e) {
    return { ok: false, status: 0, error: e.message }
  }
}

export const STORAGE_KEYS = {
  daily: 'sanjay_daily_dual_v1',
  progress: 'sanjay_progress_v1',
  projects: 'sanjay_projects_v1',
  jobs: 'sanjay_jobs_v1',
  earning: 'sanjay_earning_v1',
  motivate: 'sanjay_motivate_v1',
}

export const ALL_STORAGE_KEYS = Object.values(STORAGE_KEYS)
