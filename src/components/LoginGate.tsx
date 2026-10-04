import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

/** Shows the app once the server accepts our session, otherwise asks for the password. */
export function LoginGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/session')
      .then((r) => setState(r.ok ? 'open' : 'locked'))
      .catch(() => setState('locked'))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) setState('open')
      else setError(res.status === 429 ? 'Too many attempts. Try again later.' : 'Wrong password.')
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  if (state === 'open') return children
  if (state === 'checking') return null
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h2>Chess Coach</h2>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="field-hint warn">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || !password}>Enter</button>
      </form>
    </div>
  )
}
