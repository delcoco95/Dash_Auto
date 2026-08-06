import { useState, useEffect, useRef } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  // Auto-scroll au dernier message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Message d'accueil
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: 'assistant', content: 'Bonjour ! Je suis votre assistant Dash Auto. Posez-moi des questions sur vos véhicules, l\'historique ou les documents.' }])
    }
  }, [messages.length])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/ai/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg.content })
      })

      if (!res.ok) throw new Error('Erreur API')
      const data = await res.json()
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Désolé, une erreur est survenue lors de la communication avec le serveur IA.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Bouton Bulle Flottante */}
      <button 
        className={`chat-bubble-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Assistant IA"
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {/* Fenêtre de Chat */}
      {isOpen && (
        <div className="chat-bubble-window">
          <div className="chat-bubble-header">
            <div className="chat-bubble-title">🤖 Assistant IA</div>
            <button className="chat-bubble-close" onClick={() => setIsOpen(false)}>✕</button>
          </div>
          
          <div className="chat-bubble-body">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <div className="chat-message-bubble">
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-message assistant">
                <div className="chat-message-bubble typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-bubble-footer" onSubmit={sendMessage}>
            <input
              type="text"
              placeholder="Poser une question..."
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              Envoyer
            </button>
          </form>
        </div>
      )}
    </>
  )
}
