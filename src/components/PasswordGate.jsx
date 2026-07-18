import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Real auth: Supabase Auth session + Row Level Security scope access to this
// one signed-in user, so a stolen/public API key alone can't read or write
// the data (unlike the old hardcoded client-side password).
export default function PasswordGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  if (session === undefined) return <div className="login-wrap" />
  if (session) return children

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-eyebrow">Sanjay's Daily</div>
        <h1 className="login-title">Sign in</h1>
        <input
          type="email"
          className="login-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoFocus
        />
        <input
          type="password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="btn login-btn" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
