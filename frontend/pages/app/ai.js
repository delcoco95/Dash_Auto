import { useState, useRef, useEffect } from 'react'
import Layout from '../../components/Layout'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const SUGGESTIONS = [
  'Quels véhicules ont le meilleur profit ?',
  'Quels sont les véhicules avec les charges les plus élevées ?',
  'Donne-moi un résumé de mon activité.',
]

export default function AI() {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: 'Bonjour ! Je suis votre assistant IA spécialisé dans l\'analyse de votre parc automobile. Posez-moi une question sur vos véhicules, charges ou performances.',
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (query) => {
    const q = query || input.trim()
    if (!q) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)

    try {
      const r = await fetch(`${API_URL}/ai/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await r.json()

      let text = ''
      if (data.answer) {
        text = data.answer
      } else if (data.note) {
        text = data.note + '\n\n'
        if (data.local_analysis?.opportunities?.length) {
          text += ' **Meilleures opportunités :**\n'
          data.local_analysis.opportunities.slice(0, 3).forEach(o => {
            text += `• ${o.brand} ${o.model} — profit estimé : ${o.profit_if_sold?.toLocaleString('fr-FR')} €\n`
          })
        }
        if (data.local_analysis?.high_costs?.length) {
          text += '\n **Véhicules avec charges élevées :**\n'
          data.local_analysis.high_costs.slice(0, 3).forEach(c => {
            text += `• Véhicule #${c.vehicle_id} — ${c.charges?.toLocaleString('fr-FR')} € de charges\n`
          })
        }
      } else if (data.error) {
        text = `️ Erreur : ${data.error}`
      } else {
        text = JSON.stringify(data, null, 2)
      }

      setMessages(prev => [...prev, { role: 'ai', text }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: '️ Impossible de contacter le backend.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <Layout title="Assistant IA">
      <div className="page-header">
        <h1 className="page-title">Assistant IA</h1>
        <p className="page-subtitle">Analyse intelligente de votre activité</p>
      </div>

      <div className="page-body">
        {/* Suggestions rapides */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              className="btn btn-ghost"
              style={{ fontSize: 13, padding: '6px 14px' }}
              onClick={() => sendMessage(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="card fade-in-up">
          <div className="card-header">
            <span className="card-title"> Conversation</span>
            <span style={{
              fontSize: 12,
              padding: '3px 10px',
              background: 'rgba(0,212,170,.1)',
              border: '1px solid rgba(0,212,170,.2)',
              borderRadius: 20,
              color: 'var(--accent-2)',
            }}>
              ● Analyse locale
            </span>
          </div>

          <div className="card-body">
            {/* Messages */}
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={i} className={`chat-bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
                  <div className={`chat-avatar ${m.role === 'user' ? 'user-avatar' : 'ai-avatar'}`}>
                    {m.role === 'user' ? '' : ''}
                  </div>
                  <div className="chat-text" style={{ whiteSpace: 'pre-wrap' }}>
                    {m.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="chat-bubble ai">
                  <div className="chat-avatar ai-avatar"></div>
                  <div className="chat-text">
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                      Analyse en cours...
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="chat-input-area">
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Posez votre question sur vos véhicules, charges, performance... (Entrée pour envoyer)"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <button
                className="btn btn-primary"
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                style={{ minWidth: 100, alignSelf: 'stretch' }}
              >
                {loading ? '⟳' : ' Envoyer'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Maj+Entrée pour sauter une ligne • Entrée pour envoyer
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
