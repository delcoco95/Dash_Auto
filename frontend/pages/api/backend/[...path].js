// Proxy authentifié vers le backend FastAPI.
// 1. refuse toute requête sans cookie de session valide (401) ;
// 2. relaie la requête au backend en ajoutant l'en-tête secret X-Api-Secret
//    (connu uniquement des serveurs Vercel et Render, jamais du navigateur).
import { SESSION_COOKIE, verifySessionToken } from '../../../lib/session'

export const config = { api: { bodyParser: false, responseLimit: false } }

const BACKEND_URL = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const FORWARD_REQ_HEADERS = ['content-type', 'accept', 'range']
const FORWARD_RES_HEADERS = ['content-type', 'content-disposition', 'content-length', 'cache-control', 'etag', 'last-modified', 'accept-ranges', 'content-range']

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return chunks.length ? Buffer.concat(chunks) : undefined
}

export default async function handler(req, res) {
  if (!(await verifySessionToken(req.cookies?.[SESSION_COOKIE]))) {
    return res.status(401).json({ detail: 'Non authentifié' })
  }

  const parts = Array.isArray(req.query.path) ? req.query.path : [req.query.path]
  if (parts.some(p => p === '..' || p === '.')) return res.status(400).json({ detail: 'Chemin invalide' })
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const target = `${BACKEND_URL}/${parts.map(encodeURIComponent).join('/')}${qs}`

  const headers = {}
  for (const h of FORWARD_REQ_HEADERS) if (req.headers[h]) headers[h] = req.headers[h]
  if (process.env.API_SECRET) headers['x-api-secret'] = process.env.API_SECRET

  try {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req)
    const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual' })
    res.status(upstream.status)
    for (const h of FORWARD_RES_HEADERS) {
      const v = upstream.headers.get(h)
      if (v && h !== 'content-length') res.setHeader(h, v)
    }
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('content-length', buf.length)
    return res.end(buf)
  } catch (err) {
    console.error('Proxy backend:', err)
    return res.status(502).json({ detail: 'Backend injoignable' })
  }
}
