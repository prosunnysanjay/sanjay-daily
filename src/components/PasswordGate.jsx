import { useState } from 'react'

// NOTE: this is a simple deterrent, not real security. The password below
// ships inside the JavaScript bundle and is visible to anyone who looks at
// the page source or browser dev tools. It stops a casual visitor from
// wandering in; it will not stop someone who deliberately goes looking.
const APP_PASSWORD = 'RoseandSanjay'
const SESSION_KEY = 'sanjay_daily_unlocked'

export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'true')
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (input === APP_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      setUnlocked(true)
      setError(false)
    } else {
      setError(true)
    }
  }

  if (unlocked) return children

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-eyebrow">Sanjay's Daily</div>
        <h1 className="login-title">Enter password</h1>
        <input
          type="password"
          className="login-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setError(false)
          }}
          placeholder="Password"
          autoFocus
        />
        {error && <div className="login-error">That's not it — try again.</div>}
        <button type="submit" className="btn login-btn">
          Unlock
        </button>
      </form>
    </div>
  )
}
