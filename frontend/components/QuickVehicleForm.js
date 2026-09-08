/**
 * QuickVehicleForm — mode "ajout express" : 5 champs, création en quelques
 * secondes. Le reste des informations (technique, notes, champs personnalisés)
 * se complète ensuite depuis la fiche véhicule, en mode édition complète.
 */
import { useEffect, useRef, useState } from 'react'

const STATUSES = ['en stock', 'vendu', 'en réparation', 'réservé', 'hors service']

// Formate une immatriculation au format AA-123-AA au fil de la saisie (indicatif, non bloquant).
function formatRegistration(raw) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const letters1 = clean.slice(0, 2)
  const digits = clean.slice(2, 5)
  const letters2 = clean.slice(5, 7)
  return [letters1, digits, letters2].filter(Boolean).join('-')
}

export default function QuickVehicleForm({ apiUrl, onSubmit, loading, onSwitchToFull }) {
  const [form, setForm] = useState({ brand: '', model: '', registration: '', price_buy: '', status: 'en stock' })
  const [errors, setErrors] = useState({})
  const [dupWarning, setDupWarning] = useState(null)
  const debounceRef = useRef(null)

  const set = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }))
  }

  // Vérification de doublon d'immatriculation en direct (requête différée).
  useEffect(() => {
    const reg = form.registration.trim()
    setDupWarning(null)
    if (reg.length < 4) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${apiUrl}/vehicles?search=${encodeURIComponent(reg)}`)
        const list = await res.json()
        const match = Array.isArray(list) && list.find(v => (v.registration || '').toUpperCase() === reg.toUpperCase())
        if (match) setDupWarning(`Cette immatriculation existe déjà : ${match.brand} ${match.model} (${match.status})`)
      } catch { /* vérification best-effort, on ne bloque jamais la saisie */ }
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [form.registration, apiUrl])

  const handleSubmit = (e) => {
    e.preventDefault()
    const e2 = {}
    if (!form.brand.trim()) e2.brand = 'La marque est obligatoire'
    if (!form.model.trim()) e2.model = 'Le modèle est obligatoire'
    setErrors(e2)
    if (Object.keys(e2).length) return

    onSubmit({
      brand: form.brand,
      model: form.model,
      registration: form.registration || null,
      price_buy: form.price_buy ? parseFloat(form.price_buy) : null,
      status: form.status,
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-grid-3">
        <div className="form-group">
          <label className="form-label required">Marque</label>
          <input className="form-input" autoFocus value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Ex: Renault" />
          {errors.brand && <span className="form-error">{errors.brand}</span>}
        </div>
        <div className="form-group">
          <label className="form-label required">Modèle</label>
          <input className="form-input" value={form.model} onChange={e => set('model', e.target.value)} placeholder="Ex: Clio" />
          {errors.model && <span className="form-error">{errors.model}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Immatriculation</label>
          <input className="form-input" value={form.registration} onChange={e => set('registration', formatRegistration(e.target.value))} placeholder="AA-123-AA" maxLength={9} />
          {dupWarning && <span className="form-hint" style={{ color: 'var(--warning)' }}>{dupWarning}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Prix d'achat (€)</label>
          <input className="form-input" type="number" min="0" step="0.01" value={form.price_buy} onChange={e => set('price_buy', e.target.value)} placeholder="Ex: 8500" />
        </div>
        <div className="form-group">
          <label className="form-label">Statut</label>
          <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
        Version / VIN / caractéristiques / entretien / notes se complètent ensuite depuis la fiche du véhicule.
      </p>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, borderTop: '1px solid var(--border)', marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={onSwitchToFull}>
          Formulaire complet →
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Enregistrement...' : 'Créer le véhicule'}
        </button>
      </div>
    </form>
  )
}
