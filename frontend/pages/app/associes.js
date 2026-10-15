/**
 * Associés : qui a acheté / vendu chaque véhicule, et les commissions de chacun.
 * Suivi indépendant du profit net, des charges et de la TVA.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'react-hot-toast'
import Layout from '../../components/Layout'
import { initials } from '../../components/PartnersWidget'
import { API_URL } from '../../lib/api'
import { apiJSON } from '../../lib/upload'
import { fmt, fmtDate } from '../../lib/format'
import { Plus, X, Trash2, Settings2 } from 'lucide-react'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
const num = (x) => { const n = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null }
const SUMMARY = `${API_URL}/partners/summary`

function CommissionModal({ data, initial, onClose, onSaved }) {
  const [f, setF] = useState({
    vehicle_id: initial?.vehicle_id ?? '', partner: initial?.partner ?? data.partners[0] ?? '',
    invested: initial?.invested ?? '', commission: initial?.commission ?? '',
    date: initial?.date ?? new Date().toISOString().slice(0, 10), status: initial?.status ?? 'à verser', notes: initial?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const vehicle = data.vehicles.find(v => v.id === Number(f.vehicle_id))

  const submit = async (e) => {
    e.preventDefault()
    if (!f.partner) return toast.error('Choisissez un associé')
    if (num(f.commission) == null && num(f.invested) == null) return toast.error('Indiquez une commission ou un montant investi')
    setSaving(true)
    try {
      const body = { ...f, vehicle_id: f.vehicle_id ? Number(f.vehicle_id) : null, invested: num(f.invested), commission: num(f.commission), date: f.date || null, notes: f.notes || null }
      if (initial?.id) await apiJSON(`/partners/commissions/${initial.id}`, 'PUT', body)
      else await apiJSON('/partners/commissions', 'POST', body)
      toast.success('Commission enregistrée')
      onSaved()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!initial?.id) return
    try { await apiJSON(`/partners/commissions/${initial.id}`, 'DELETE'); toast.success('Supprimée'); onSaved() } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '94%', maxWidth: 520, padding: 24, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{initial?.id ? 'Modifier la commission' : 'Nouvelle commission'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Fermer"><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Associé</label>
            <div className="segmented">
              {data.partners.map(p => <button type="button" key={p} className={`segmented-btn${f.partner === p ? ' active' : ''}`} onClick={() => set('partner', p)}>{p}</button>)}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Véhicule</label>
            <select className="form-input" value={f.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
              <option value="">— Aucun —</option>
              {data.vehicles.map(v => <option key={v.id} value={v.id}>{v.label}{v.sold ? ' (vendu)' : ''}</option>)}
            </select>
            {vehicle && <span className="form-hint">Achat {fmt(vehicle.price_buy)}{vehicle.sold ? ` · vendu ${fmt(vehicle.price_sell)}` : ''}</span>}
          </div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Montant investi (€)</label>
              <input className="form-input" inputMode="decimal" placeholder="ex. 2000" value={f.invested} onChange={e => set('invested', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Commission (€)</label>
              <input className="form-input" inputMode="decimal" placeholder="ex. 500" value={f.commission} onChange={e => set('commission', e.target.value)} /></div>
          </div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Date</label>
              <input type="date" className="form-input" value={f.date || ''} onChange={e => set('date', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Statut</label>
              <div className="segmented">
                {['à verser', 'versée'].map(s => <button type="button" key={s} className={`segmented-btn${f.status === s ? ' active' : ''}`} onClick={() => set('status', s)}>{s === 'versée' ? 'Versée' : 'À verser'}</button>)}
              </div></div>
          </div>
          <div className="form-group"><label className="form-label">Note</label>
            <textarea className="form-textarea" style={{ minHeight: 60 }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
          <p className="form-hint" style={{ marginBottom: 12 }}>Les commissions sont suivies à part : elles ne changent ni le profit net, ni les charges, ni la TVA.</p>
          <div className="wizard-actions">
            {initial?.id ? <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={remove}><Trash2 size={15} /> Supprimer</button> : <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>}
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Associes() {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { data, error } = useSWR(SUMMARY, fetcher)
  const [modal, setModal] = useState(null)   // null | {} | commission
  const [filter, setFilter] = useState('tous')
  const [editPartners, setEditPartners] = useState(false)
  const [partnersText, setPartnersText] = useState('')

  useEffect(() => {
    if (!router.isReady) return
    if (router.query.ajouter) setModal({})
    if (router.query.filtre === 'a-renseigner') setFilter('a-renseigner')
  }, [router.isReady, router.query.ajouter, router.query.filtre])

  const refresh = () => { mutate(SUMMARY); setModal(null) }

  const setDeal = async (vid, patch) => {
    mutate(SUMMARY, d => d && { ...d, vehicles: d.vehicles.map(v => v.id === vid ? { ...v, ...patch } : v) }, false)
    try { await apiJSON(`/partners/vehicles/${vid}`, 'PUT', patch); mutate(SUMMARY) } catch (err) { toast.error(err.message); mutate(SUMMARY) }
  }

  const savePartners = async () => {
    try {
      await apiJSON('/partners/list', 'PUT', { partners: partnersText.split(',').map(s => s.trim()).filter(Boolean) })
      setEditPartners(false); mutate(SUMMARY)
    } catch (err) { toast.error(err.message) }
  }

  const rows = useMemo(() => {
    if (!data) return []
    return data.vehicles.filter(v => {
      if (filter === 'tous') return true
      if (filter === 'a-renseigner') return !v.bought_by || (v.sold && !v.sold_by)
      return v.bought_by === filter || v.sold_by === filter || v.commissions.some(c => c.partner === filter)
    })
  }, [data, filter])

  return (
    <Layout title="Associés">
      <div className="page-header">
        <div>
          <h1 className="page-title">Associés</h1>
          <p className="page-subtitle">Qui a acheté et vendu chaque véhicule, et la commission de chacun — à part du profit net.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => { setPartnersText((data?.partners || []).join(', ')); setEditPartners(v => !v) }}><Settings2 size={16} /> Associés</button>
          <button className="btn btn-primary" onClick={() => setModal({})} disabled={!data}><Plus size={16} /> Nouvelle commission</button>
        </div>
      </div>

      <div className="page-body">
        {editPartners && (
          <div className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="form-input" style={{ flex: 1, minWidth: 200 }} value={partnersText} onChange={e => setPartnersText(e.target.value)} placeholder="Nedj, Mams" />
            <button className="btn btn-primary" onClick={savePartners}>Enregistrer</button>
            <span className="form-hint" style={{ width: '100%' }}>Noms séparés par des virgules.</span>
          </div>
        )}

        {error && <div className="empty-state">Erreur de connexion au backend.</div>}
        {!data && !error && <div className="loading-spinner"><div className="spinner" /> Chargement…</div>}

        {data && (
          <>
            <div className="partner-cards">
              {data.by_partner.map(p => (
                <div key={p.partner} className="kpi-card" style={{ cursor: 'pointer', outline: filter === p.partner ? '2px solid var(--accent-primary)' : 'none' }}
                  onClick={() => setFilter(filter === p.partner ? 'tous' : p.partner)}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                    <div className="partner-avatar">{initials(p.partner)}</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.partner}</div>
                  </div>
                  <div className="mini-stat-row"><span className="mini-stat-label">Véhicules achetés / vendus</span><span className="mini-stat-value">{p.bought} / {p.sold}</span></div>
                  <div className="mini-stat-row"><span className="mini-stat-label">Montant investi</span><span className="mini-stat-value">{fmt(p.invested)}</span></div>
                  <div className="mini-stat-row"><span className="mini-stat-label">Commissions</span><span className="mini-stat-value">{fmt(p.commission)}</span></div>
                  <div className="mini-stat-row"><span className="mini-stat-label">dont à verser</span><span className={`mini-stat-value${p.commission_due ? ' negative' : ''}`}>{fmt(p.commission_due)}</span></div>
                </div>
              ))}
            </div>

            <div className="segmented" style={{ marginBottom: 12 }}>
              {[['tous', 'Tous'], ...data.partners.map(p => [p, p]), ['a-renseigner', `À renseigner${data.unassigned ? ` (${data.unassigned})` : ''}`]].map(([k, l]) => (
                <button key={k} className={`segmented-btn${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>

            <div className="card" style={{ padding: 0 }}>
              {rows.length === 0 && <div className="empty-state">Aucun véhicule.</div>}
              {rows.map(v => (
                <div key={v.id} className="deal-row">
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/app/vehicles/${v.id}`} className="doc-link-main" style={{ fontWeight: 600 }}>{v.brand} {v.model}</Link>
                    {v.registration && <span style={{ color: '#1976d2', marginLeft: 8, fontSize: 13 }}>{v.registration}</span>}
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Achat {fmt(v.price_buy)}{v.date_buy ? ` le ${fmtDate(v.date_buy)}` : ''}
                      {v.sold ? ` · Vente ${fmt(v.price_sell)}${v.date_sell ? ` le ${fmtDate(v.date_sell)}` : ''}` : ' · en stock'}
                    </div>
                  </div>
                  <div className="deal-selects">
                    <div>
                      <label>Acheté par</label>
                      <select className="form-input" style={{ padding: '6px 8px' }} value={v.bought_by || ''} onChange={e => setDeal(v.id, { bought_by: e.target.value })}>
                        <option value="">—</option>
                        {data.partners.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Vendu par</label>
                      <select className="form-input" style={{ padding: '6px 8px' }} value={v.sold_by || ''} onChange={e => setDeal(v.id, { sold_by: e.target.value })} disabled={!v.sold && !v.sold_by}>
                        <option value="">{v.sold ? '—' : 'pas vendu'}</option>
                        {data.partners.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="deal-comms">
                    {v.commissions.map(c => (
                      <button key={c.id} className={`comm-chip ${c.status === 'versée' ? 'paid' : 'due'}`} onClick={() => setModal(c)} title={c.notes || ''}>
                        <b>{c.partner}</b>
                        {c.commission != null && <span>{fmt(c.commission)}</span>}
                        {c.invested != null && <span style={{ color: 'var(--text-muted)' }}>investi {fmt(c.invested)}</span>}
                      </button>
                    ))}
                    <button className="file-btn ghost" onClick={() => setModal({ vehicle_id: v.id, partner: v.sold_by || v.bought_by || undefined })}><Plus size={13} /> Commission</button>
                  </div>
                </div>
              ))}
            </div>

            {data.unlinked?.length > 0 && (
              <div className="card" style={{ padding: 0, marginTop: 20 }}>
                <div className="card-header"><div className="card-title">Commissions sans véhicule</div></div>
                {data.unlinked.map(c => (
                  <div key={c.id} className="check-item" style={{ cursor: 'pointer' }} onClick={() => setModal(c)}>
                    <div><div className="check-item-title">{c.partner} · {fmt(c.commission)}</div><div className="check-item-meta">{fmtDate(c.date)} · {c.status}{c.notes ? ` · ${c.notes}` : ''}</div></div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {modal && data && <CommissionModal data={data} initial={modal} onClose={() => { setModal(null); if (router.query.ajouter) router.replace('/app/associes', undefined, { shallow: true }) }} onSaved={refresh} />}
    </Layout>
  )
}
