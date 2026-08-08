export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' })
  }

  const { username, password } = req.body
  const envUser = process.env.DASHBOARD_USER
  const envPwd = process.env.DASHBOARD_PASS

  if (username === envUser && password === envPwd) {
    const isProd = process.env.NODE_ENV === 'production'
    const cookie = `dash_auto_session=authenticated; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${isProd ? '; Secure' : ''}`

    res.setHeader('Set-Cookie', cookie)
    return res.status(200).json({ success: true })
  } else {
    return res.status(401).json({ message: 'Identifiants invalides' })
  }
}
