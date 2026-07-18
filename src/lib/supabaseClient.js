import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xrcpwknppvwujqsgrtqh.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_R37nWr-nLqdGQ3Wh56tctg_ek7TqgRl'

// This key is meant to be public — real protection comes from Row Level
// Security on the tables, scoped to the signed-in user (see supabase.js).
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})
