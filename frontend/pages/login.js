import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function Login() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      if (res.ok) {
        router.push('/app/dashboard')
      } else {
        const data = await res.json()
        setError(data.message || 'Identifiants invalides')
        setLoading(false)
      }
    } catch (err) {
      setError('Erreur de connexion')
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Connexion — Dash Auto</title>
      </Head>
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>
            <h1>Connexion</h1>
            <p>Veuillez vous authentifier pour accéder à votre espace de gestion.</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Identifiant"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                className="form-input"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="btn btn-login" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
