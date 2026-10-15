// Envoi d'un fichier (ou d'un PDF généré) dans le stockage Supabase puis enregistrement
// dans Administratif › Documents. Optionnellement, rattachement à un justificatif attendu.
import { supabase } from './supabase'
import { API_URL } from './api'

export async function uploadDocument({ file, name, vehicleId = null, category = null, date = null, amount = null, description = null }) {
  const ext = (file.name || name || 'document.pdf').split('.').pop()
  const path = `${vehicleId || 'global'}/${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || 'application/pdf' })
  if (error) throw new Error("Échec de l'envoi du fichier")
  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
  const res = await fetch(`${API_URL}/documents/url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle_id: vehicleId, category, name: name || file.name, description, doc_date: date, amount, status: 'valide', url: publicUrl, type: file.type || 'application/pdf' }),
  })
  if (!res.ok) throw new Error("Échec de l'enregistrement du document")
  return res.json()
}

export async function setChecklist(key, body) {
  const res = await fetch(`${API_URL}/fiscal/checklist/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Échec de la mise à jour')
  return res.json()
}

export async function apiJSON(path, method = 'GET', body) {
  const res = await fetch(`${API_URL}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(typeof err.detail === 'string' ? err.detail : `Erreur ${res.status}`)
  }
  return res.json()
}
