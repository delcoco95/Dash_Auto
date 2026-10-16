// Éléments partagés du suivi des déclarations (page Déclarations + Vue d'ensemble).
import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { apiJSON } from '../lib/upload'
import { fmt, fmtDate } from '../lib/format'
import { STATE_BADGE, STATE_LABEL, KINDS } from '../lib/admin'
import { X, Trash2 } from 'lucide-react'

const num = (x) => { if (x === '' || x == null) return null; const n = parseFloat(String(x).replace(',', '.')); return Number.isFinite(n) ? n : null }
const iso = (d) => (d ? String(d).slice(0, 10) : '')

// Enregistre une ligne : met à jour la déclaration existante ou crée celle attendue.
async function saveDecl(d, patch) {
  if (d.id) return apiJSON(`/admin/declarations/${d.id}`, 'PUT', patch)
  return apiJSON('/admin/declarations', 'POST', {
    kind: d.kind, form: d.form, period_start: iso(d.period_start), period_end: iso(d.period_end), due_date: iso(d.due_date), ...patch,
  })
}

export function EditModal({ decl, onClose, onSaved }) {
  const isNew = !decl.kind
  const [f, setF] = useState({
    kind: decl.kind || 'AUTRE', label: decl.notes || '', due_date: iso(decl.due_date), status: decl.status || 'à déposer',
    filed_date: iso(decl.filed_date), deposit_number: decl.deposit_number || '', amount: decl.amount ?? '', notes: decl.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const patch = { status: f.status, filed_date: f.filed_date || null, deposit_number: f.deposit_number || null, amount: num(f.amount), notes: f.notes || null }
      if (isNew) {
        if (!f.due_date) throw new Error("Indiquez la date limite")
        await apiJSON('/admin/declarations', 'POST', { kind: f.kind, due_date: f.due_date, period_start: f.due_date, ...patch })
      } else {
        await saveDecl(decl, patch)
      }
      onSaved()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }
  const remove = async () => {
    try { await apiJSON(`/admin/declarations/${decl.id}`, 'DELETE'); onSaved() } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '94%', maxWidth: 520, padding: 24, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{isNew ? 'Nouvelle déclaration' : decl.label}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Fermer"><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          {isNew && (
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Type</label>
                <select className="form-input" value={f.kind} onChange={e => set('kind', e.target.value)}>
                  {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label required">Date limite</label>
                <input type="date" className="form-input" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
            </div>
          )}
          {!isNew && <p className="form-hint" style={{ marginBottom: 14 }}>À déposer avant le {fmtDate(decl.due_date)}{decl.form ? ` · formulaire ${decl.form}` : ''}</p>}
          <div className="form-group">
            <label className="form-label">Où en est-elle ?</label>
            <div className="segmented">
              {[['à déposer', 'Pas déposée'], ['déposée', 'Déposée, pas payée'], ['payée', 'Déposée et payée'], ['non due', 'Non due']].map(([v, l]) => (
                <button type="button" key={v} className={`segmented-btn${f.status === v ? ' active' : ''}`} onClick={() => set('status', v)}>{l}</button>
              ))}
            </div>
          </div>
          {f.status !== 'à déposer' && f.status !== 'non due' && (
            <>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Déposée le</label>
                  <input type="date" className="form-input" value={f.filed_date} onChange={e => set('filed_date', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Montant à payer (€)</label>
                  <input className="form-input" inputMode="decimal" placeholder="0 si rien à payer" value={f.amount} onChange={e => set('amount', e.target.value)} /></div>
              </div>
              <div className="form-group"><label className="form-label">N° de dépôt (accusé de réception)</label>
                <input className="form-input" value={f.deposit_number} onChange={e => set('deposit_number', e.target.value)} /></div>
            </>
          )}
          <div className="form-group"><label className="form-label">{isNew ? 'Nom / note' : 'Note'}</label>
            <textarea className="form-textarea" style={{ minHeight: 60 }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
          <div className="wizard-actions">
            {decl.id ? <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={remove}><Trash2 size={15} /> Supprimer</button> : <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>}
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function DeclRow({ d, onEdit, onChanged }) {
  const quick = async (status) => {
    try { await saveDecl(d, { status }); onChanged() } catch (err) { toast.error(err.message) }
  }
  return (
    <div className="check-item">
      <div style={{ cursor: 'pointer' }} onClick={() => onEdit(d)}>
        <div className="check-item-title">{d.label}</div>
        <div className="check-item-meta">
          <span>Avant le {fmtDate(d.due_date)}</span>
          {d.form && <span>{d.form}</span>}
          {d.filed_date && <span>déposée le {fmtDate(d.filed_date)}</span>}
          {d.amount > 0 && <span>{fmt(d.amount)}</span>}
        </div>
      </div>
      <div className="check-item-actions">
        <span className={`badge ${STATE_BADGE[d.state]}`}>{STATE_LABEL[d.state]}</span>
        {(d.state === 'à déposer' || d.state === 'en retard') && <button className="file-btn" onClick={() => onEdit({ ...d, status: 'déposée' })}>Déposée</button>}
        {d.state === 'à payer' && <button className="file-btn" onClick={() => quick('payée')}>Payée</button>}
      </div>
    </div>
  )
}

