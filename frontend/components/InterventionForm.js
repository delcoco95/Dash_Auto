/**
 * InterventionForm — formulaire unique de création/édition d'intervention.
 * Utilisé à la fois depuis le tableau de bord (avec sélecteur de véhicule)
 * et depuis l'onglet Travaux d'une fiche véhicule (véhicule déjà connu).
 * Une seule liste de catégories et un seul champ priorité, partagés partout.
 */
import { useState } from 'react'

export const INTERVENTION_CATS = ['', 'Vidange', 'Révision', 'Freins', 'Pneus', 'Carrosserie', 'Peinture', 'Pare-brise', 'Contrôle technique', 'Nettoyage', 'Diagnostic', 'Électricité', 'Entretien général', 'Autre']
export const INT_STATUSES = ['à prévoir', 'en cours', 'terminée', 'annulée']
export const INT_PRIORITIES = ['haute', 'normale', 'basse']

export default function InterventionForm({ vehicles, showVehicleSelect = false, onSubmit, onCancel, submitLabel = 'Ajouter' }) {
  const [form, setForm] = useState({
    title: '', category: '', status: 'à prévoir', priority: 'normale',
    date_planned: '', cost_estimated: '', cost_actual: '', description: '', vehicle_id: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const set = (name, value) => setForm(prev => ({ ...prev, [name]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    if (showVehicleSelect && !form.vehicle_id) return
    setSubmitting(true)
    try {
      await onSubmit({
        title: form.title,
        category: form.category || null,
        status: form.status,
        priority: form.priority,
        date_planned: form.date_planned || null,
        cost_estimated: form.cost_estimated ? parseFloat(form.cost_estimated) : null,
        cost_actual: form.cost_actual ? parseFloat(form.cost_actual) : null,
        description: form.description || null,
        ...(showVehicleSelect ? { vehicle_id: parseInt(form.vehicle_id) } : {}),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="inline-form-title">Nouvelle intervention</div>
      <div className="form-grid-2" style={{ marginBottom: 12 }}>
        <div className="form-group span-2">
          <label className="form-label required">Titre</label>
          <input className="form-input" required value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Vidange + filtres" />
        </div>

        {showVehicleSelect && (
          <div className="form-group span-2">
            <label className="form-label required">Véhicule</label>
            <select className="form-input" required value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
              <option value="">-- Choisir un véhicule --</option>
              {vehicles?.map(v => (
                <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.registration})</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Catégorie</label>
          <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
            {INTERVENTION_CATS.map(c => <option key={c} value={c}>{c || '— Catégorie —'}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Statut</label>
          <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
            {INT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Priorité</label>
          <select className="form-input" value={form.priority} onChange={e => set('priority', e.target.value)}>
            {INT_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Date prévue</label>
          <input className="form-input" type="date" value={form.date_planned} onChange={e => set('date_planned', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Coût estimé (€)</label>
          <input className="form-input" type="number" step="0.01" min="0" value={form.cost_estimated} onChange={e => set('cost_estimated', e.target.value)} placeholder="0.00" />
        </div>
        <div className="form-group">
          <label className="form-label">Coût réel (€)</label>
          <input className="form-input" type="number" step="0.01" min="0" value={form.cost_actual} onChange={e => set('cost_actual', e.target.value)} placeholder="Une fois les travaux terminés" />
        </div>
        <div className="form-group span-2">
          <label className="form-label">Description</label>
          <textarea className="form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Détails..." style={{ resize: 'vertical' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }} disabled={submitting}>
          {submitting ? 'Enregistrement...' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onCancel}>Annuler</button>
        )}
      </div>
    </form>
  )
}
