// Shared storage layer backed by Supabase, used by every tab component.
// Same get/set/delete/list shape as the old raw-fetch shim, so each
// component's logic is unchanged — but requests now go through the
// authenticated client so Row Level Security can actually scope access
// to the signed-in user instead of relying on a public key alone.

import { supabase } from './supabaseClient'

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}

export async function storageGet(key) {
  const { data, error } = await supabase.from('app_storage').select('key,value').eq('key', key).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('not found')
  return { key, value: JSON.stringify(data.value) }
}

export async function storageSet(key, value) {
  let parsedValue
  try {
    parsedValue = JSON.parse(value)
  } catch {
    parsedValue = value
  }
  const user_id = await currentUserId()
  const { error } = await supabase
    .from('app_storage')
    .upsert({ key, value: parsedValue, user_id, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
  return { key, value }
}

export async function storageDelete(key) {
  const { error } = await supabase.from('app_storage').delete().eq('key', key)
  if (error) throw error
  return { key, deleted: true }
}

export async function storageList(prefix) {
  let query = supabase.from('app_storage').select('key')
  if (prefix) query = query.like('key', `${prefix}%`)
  const { data, error } = await query
  if (error) throw error
  return { keys: data.map((r) => r.key), prefix }
}

export async function healthCheck() {
  try {
    const { error } = await supabase.from('app_storage').select('key').limit(1)
    return { ok: !error, status: error ? 0 : 200, error: error?.message }
  } catch (e) {
    return { ok: false, status: 0, error: e.message }
  }
}

export const STORAGE_KEYS = {
  daily: 'sanjay_daily_dual_v1',
  things: 'sanjay_things_v1',
  revision: 'sanjay_revision_v1',
  roadmap: 'sanjay_roadmap_v1',
  projects: 'sanjay_projects_v1',
  jobs: 'sanjay_jobs_v1',
  earning: 'sanjay_earning_v1',
  motivate: 'sanjay_motivate_v1',
}

export const ALL_STORAGE_KEYS = Object.values(STORAGE_KEYS)
