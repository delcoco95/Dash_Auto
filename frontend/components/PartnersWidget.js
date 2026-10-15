/**
 * Bulle « Commissions » du tableau de bord (Nedj, Mams…).
 * Un clic l'agrandit : liste des commissions par véhicule, ajout / modification / suppression.
 * Suivi indépendant du profit net, des charges et de la TVA.
 */
import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'react-hot-toast'
import { ArrowUpRight, Plus, Users, X, Trash2, Check } from 'lucide-react'
import { API_URL } from '../lib/api'
import { apiJSON } from '../lib/upload'
import { fmt, fmtDate } from '../lib/format'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
const SUMMARY = `${API_URL}/partners/summary`
const num = (x) => { const n = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null }

function initials(name) {
  return (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function CommissionForm({ data, initial, onDone, onCancel }) {
  const [f, setF] = useState({
    partner: initial?.partner ?? data.partners[0] ?? '',
    vehicle_id: initial?.vehicle_id ?? '',
    commission: initial?.commission ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!f.vehicle_id) return toast.error('Choisissez le véhicule')
    if (num(f.commission) == null) return toast.error('Indiquez le montant')
    setSaving(true)
    try {
      const body = { partner: f.partner, vehicle_id: Number(f.vehicle_id), commission: num(f.commission), date: initial?.date || new Date().toISOString().slice(0, 10) }
      if (initial?.id) await apiJSON(`/partners/commissions/${initial.id}`, 'PUT', body)
      else await apiJSON('/partners/commissions', 'POST', body)
      onDone()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="comm-form">
      <div className="segmented">
        {data.partners.map(p => <button type="button" key={p} className={`segmented-btn${f.partner === p ? ' active' : ''}`} onClick={() => set('partner', p)}>{p}</button>)}
      </div>
      <select className="form-input" value={f.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
        <option value="">Véhicule…</option>
        {data.vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>
      <input className="form-input" inputMode="decimal" placeholder="Commission (€)" value={f.commission} onChange={e => set('commission', e.target.value)} />
      <div style={{ display: 'flex', gap: 8 }}>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>}
        <button type="submit" className="btn btn-primary" disabled={saving}><Check size={15} /> {initial?.id ? 'Modifier' : 'Ajouter'}</button>
      </div>
    </form>
  )
}

export default function PartnersWidget() {
  const { mutate } = useSWRConfig()
  const { data, error } = useSWR(SUMMARY, fetcher)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)

  const refresh = () => { mutate(SUMMARY); setAdding(false); setEditId(null) }
  const remove = async (id) => {
    try { await apiJSON(`/partners/commissions/${id}`, 'DELETE'); refresh() } catch (err) { toast.error(err.message) }
  }

  const commissions = (data?.commissions || []).filter(c => c.commission != null)

  return (
    <>
      <div className="widget-card" style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }} onClick={() => setOpen(true)}>
        <div className="widget-header">
          <div className="widget-title"><Users size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Commissions</div>
          <span className="kpi-icon-wrapper" style={{ background: 'transparent', border: 'none' }}><ArrowUpRight size={16} color="var(--text-primary)" /></span>
        </div>

        {error && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Indisponible.</p>}
        {!data && !error && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}

        {data && (
          <div style={{ flex: 1 }}>
            {data.by_partner.map(p => (
              <div key={p.partner} className="partner-row">
                <div className="partner-avatar">{initials(p.partner)}</div>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{p.partner}</div>
                <div style={{ fontWeight: 700 }}>{fmt(p.commission)}</div>
              </div>
            ))}
            {commissions.slice(0, 3).map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '6px 0' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{c.partner}</b> · {c.vehicle || '—'}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{fmt(c.commission)}</span>
              </div>
            ))}
            {commissions.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Aucune commission.</p>}
          </div>
        )}
      </div>

      {open && data && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '94%', maxWidth: 560, padding: 24, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Commissions</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Fermer"><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {data.by_partner.map(p => (
                <div key={p.partner} className="comm-total"><span>{p.partner}</span><b>{fmt(p.commission)}</b></div>
              ))}
            </div>

            {adding
              ? <CommissionForm data={data} onDone={refresh} onCancel={() => setAdding(false)} />
              : <button className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }} onClick={() => { setAdding(true); setEditId(null) }}><Plus size={16} /> Ajouter une commission</button>}

            {commissions.map(c => editId === c.id ? (
              <CommissionForm key={c.id} data={data} initial={c} onDone={refresh} onCancel={() => setEditId(null)} />
            ) : (
              <div key={c.id} className="transaction-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => { setEditId(c.id); setAdding(false) }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.vehicle || 'Sans véhicule'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.partner}{c.date ? ` · ${fmtDate(c.date)}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <b style={{ whiteSpace: 'nowrap' }}>{fmt(c.commission)}</b>
                  <button onClick={e => { e.stopPropagation(); remove(c.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} aria-label="Supprimer"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
            {commissions.length === 0 && !adding && <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>Aucune commission pour l'instant.</p>}
          </div>
        </div>
      )}
    </>
  )
}
