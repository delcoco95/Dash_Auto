// Cookie de session signé (HMAC-SHA256) — compatible Edge (middleware) et Node (routes API).
// Valeur : "<expiration en secondes>.<signature hex>". Impossible à fabriquer sans le secret.
export const SESSION_COOKIE = 'dash_auto_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 jours

function getSecret() {
  return process.env.SESSION_SECRET
    || `${process.env.DASHBOARD_USER || ''}:${process.env.DASHBOARD_PASS || ''}:dash-auto-session`
}

async function hmacHex(message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(getSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createSessionToken() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  return `${exp}.${await hmacHex(String(exp))}`
}

export async function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false
  const [exp, sig] = token.split('.')
  if (!/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return false
  const expected = await hmacHex(exp)
  if (expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0
}
