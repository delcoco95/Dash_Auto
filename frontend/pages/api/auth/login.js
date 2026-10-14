import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken } from '../../../lib/session'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' })
  }

  const { username, password } = req.body || {}
  const envUser = process.env.DASHBOARD_USER
  const envPwd = process.env.DASHBOARD_PASS

  if (envUser && envPwd && username === envUser && password === envPwd) {
    const isProd = process.env.NODE_ENV === 'production'
    const token = await createSessionToken()
    const cookie = `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax${isProd ? '; Secure' : ''}`
    res.setHeader('Set-Cookie', cookie)
    return res.status(200).json({ success: true })
  }
  return res.status(401).json({ message: 'Identifiants invalides' })
}
