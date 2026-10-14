import { SESSION_COOKIE } from '../../../lib/session'

// Le cookie de session est HttpOnly : seul le serveur peut l'effacer.
export default function handler(req, res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`)
  return res.status(200).json({ success: true })
}
