import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import Layout from '../../../components/Layout'
import AdminTabs from '../../../components/AdminTabs'
import { fmtDate, vehicleLabel } from '../../../lib/format'
import { MONTHS, ENTRY_KINDS, ENTRY_KIND_HELP, CA3_CASES, statusBadge, eur } from '../../../lib/fiscal'
import {
  Plus, X, Pencil, Trash2, AlertTriangle, Info, CheckCircle2, Settings, CalendarClock, Receipt, Landmark, ExternalLink,
} from 'lucide-react'
import { API_URL } from '../../../lib/api'


const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
const IMPOTS_URL = 'https://cfspro.impots.gouv.fr/'

const EMPTY_ENTRY = { kind: 'achat_fr_tva', date: '', vehicle_id: '', supplier: '', country: 'FR', invoice_ref: '', label: '', amount_ht: '', vat_rate: 20, vat_amount: '', has_invoice: true, notes: '', charge_id: null, intervention_id: null }

async function api(path, method = 'GET', body) {
  const res = await fetch(`${API_URL}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ? JSON.stringify(err.detail) : `Erreur ${res.status}`)
  }
  return res.json()
}

function Modal({ title, onClose, children, width = 640 }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '92%', maxWidth: width, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Fermer"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Kpi({ title, value, sub, tone }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--text-primary)'
  return (
    <div className="kpi-card">
      <div className="kpi-card-header"><div className="kpi-title">{title}</div></div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      {sub && <div className="kpi-trend" style={{ color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  )
}

// ── Formulaire pièce fiscale ─────────────────────────────────────
function EntryForm({ initial, vehicles, onSaved, onCancel }) {
  const [f, setF] = useState({ ...EMPTY_ENTRY, ...initial })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  // Suggestion automatique de la TVA à 20 % pour un achat français
  const suggestVat = () => {
    const ht = parseFloat(String(f.amount_ht).replace(',', '.'))
    if (!Number.isNaN(ht)) set('vat_amount', Math.round(ht * (parseFloat(f.vat_rate) || 20)) / 100)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!f.date) return toast.error('La date de la facture est obligatoire (elle décide du mois de déclaration).')
    setSaving(true)
    const num = (x) => (x === '' || x == null ? 0 : parseFloat(String(x).replace(',', '.')))
    const payload = {
      ...f,
      vehicle_id: f.vehicle_id ? parseInt(f.vehicle_id) : null,
      amount_ht: num(f.amount_ht), vat_rate: num(f.vat_rate), vat_amount: ['achat_fr_tva', 'immobilisation'].includes(f.kind) ? num(f.vat_amount) : 0,
    }
    delete payload.id; delete payload.vehicle; delete payload.created_at
    try {
      if (initial?.id) await api(`/fiscal/entries/${initial.id}`, 'PUT', payload)
      else await api('/fiscal/entries', 'POST', payload)
      toast.success('Pièce enregistrée')
      onSaved()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const withVat = ['achat_fr_tva', 'immobilisation'].includes(f.kind)
  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label className="form-label required">Type de pièce</label>
        <select className="form-input" value={f.kind} onChange={e => set('kind', e.target.value)}>
          {Object.entries(ENTRY_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="form-hint">{ENTRY_KIND_HELP[f.kind]}</span>
      </div>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label required">Date de la facture</label>
          <input type="date" className="form-input" value={f.date || ''} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Véhicule</label>
          <select className="form-input" value={f.vehicle_id || ''} onChange={e => set('vehicle_id', e.target.value)}>
            <option value="">— Aucun —</option>
            {vehicles?.map(v => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Fournisseur</label>
          <input className="form-input" value={f.supplier || ''} onChange={e => set('supplier', e.target.value)} placeholder="AUTO1, garage, Oscaro…" />
        </div>
        <div className="form-group">
          <label className="form-label">Pays du fournisseur</label>
          <select className="form-input" value={f.country || 'FR'} onChange={e => set('country', e.target.value)}>
            {['FR', 'DE', 'BE', 'ES', 'IT', 'NL', 'Autre UE', 'Hors UE'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">N° de facture</label>
          <input className="form-input" value={f.invoice_ref || ''} onChange={e => set('invoice_ref', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Libellé</label>
          <input className="form-input" value={f.label || ''} onChange={e => set('label', e.target.value)} placeholder="Pièces freins, transport…" />
        </div>
        <div className="form-group">
          <label className="form-label required">{f.kind === 'sans_tva' || f.kind === 'achat_vehicule_marge' ? 'Montant' : 'Montant HT'}</label>
          <input className="form-input" inputMode="decimal" value={f.amount_ht} onChange={e => set('amount_ht', e.target.value)} onBlur={() => withVat && !f.vat_amount && suggestVat()} />
        </div>
        {withVat && (
          <div className="form-group">
            <label className="form-label">TVA facturée</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" inputMode="decimal" value={f.vat_amount} onChange={e => set('vat_amount', e.target.value)} />
              <button type="button" className="btn btn-outline" onClick={suggestVat} title="Calculer 20 % du HT">20 %</button>
            </div>
          </div>
        )}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '6px 0 14px' }}>
        <input type="checkbox" checked={!!f.has_invoice} onChange={e => set('has_invoice', e.target.checked)} />
        J'ai la facture (au nom de la société)
      </label>
      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="form-textarea" style={{ minHeight: 60 }} value={f.notes || ''} onChange={e => set('notes', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

// ── Formulaire « déclaration déposée » (suivi interne uniquement) ──
function FiledForm({ month, year, current, onSaved, onCancel }) {
  const [f, setF] = useState({
    status: current?.status && current.status !== 'à faire' ? current.status : 'déposée',
    filed_date: current?.filed_date || new Date().toISOString().slice(0, 10),
    deposit_number: current?.deposit_number || '',
    amount_declared: current?.amount_declared ?? month.lines?.TD ?? 0,
    credit_carried: current?.credit_carried ?? month.lines?.['27'] ?? 0,
    notes: current?.notes || '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api('/fiscal/declarations', 'POST', {
        kind: 'CA3', form: '3310-CA3', period_start: month.period_start, period_end: month.period_end,
        due_date: month.due_date, ...f,
        amount_declared: parseFloat(f.amount_declared) || 0, credit_carried: parseFloat(f.credit_carried) || 0,
      })
      toast.success('Suivi mis à jour')
      onSaved()
    } catch (err) { toast.error(err.message) }
  }
  return (
    <form onSubmit={submit}>
      <p className="form-hint" style={{ marginBottom: 14 }}>
        Ceci met seulement à jour le suivi dans Dash Auto. La déclaration se fait sur impots.gouv.fr.
      </p>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Statut</label>
          <select className="form-input" value={f.status} onChange={e => set('status', e.target.value)}>
            {['déposée', 'payée', 'à faire'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Date de dépôt</label>
          <input type="date" className="form-input" value={f.filed_date || ''} onChange={e => set('filed_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">N° de dépôt (accusé de réception)</label>
          <input className="form-input" value={f.deposit_number} onChange={e => set('deposit_number', e.target.value)} placeholder="TVA-2026…" />
        </div>
        <div className="form-group">
          <label className="form-label">Montant payé</label>
          <input className="form-input" inputMode="decimal" value={f.amount_declared} onChange={e => set('amount_declared', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Crédit déclaré ligne 27</label>
          <input className="form-input" inputMode="decimal" value={f.credit_carried} onChange={e => set('credit_carried', e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="form-textarea" style={{ minHeight: 60 }} value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary">Enregistrer le suivi</button>
      </div>
    </form>
  )
}

function SettingsForm({ settings, onSaved, onCancel }) {
  const [f, setF] = useState(settings || {})
  const fields = [
    ['company_name', 'Société'], ['siren', 'SIREN'], ['sie', "Service des impôts (SIE)"], ['vat_regime', 'Régime de TVA'],
    ['vat_due_day', 'Jour limite CA3 (mois suivant)'], ['first_vat_month', 'Premier mois suivi (AAAA-MM)'],
    ['initial_vat_credit', 'Crédit de TVA au début du suivi (€)'], ['is_reference_amount', "IS de l'exercice précédent (€)"],
    ['is_deficit_carryforward', 'Déficit reportable (€)'],
    ['excluded_vehicle_ids', 'Véhicules exclus (n° séparés par des virgules — ex. achat pas encore fait)'],
  ]
  const submit = async (e) => {
    e.preventDefault()
    try { await api('/fiscal/settings', 'PUT', f); toast.success('Paramètres enregistrés'); onSaved() } catch (err) { toast.error(err.message) }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid-2">
        {fields.map(([k, l]) => (
          <div className="form-group" key={k}>
            <label className="form-label">{l}</label>
            <input className="form-input" value={f[k] ?? ''} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary">Enregistrer</button>
      </div>
    </form>
  )
}

// ── Détail d'un mois de TVA ──────────────────────────────────────
function MonthDetail({ year, month, vehicles, onQualify, onEditEntry, onFiled }) {
  const { data: m, error } = useSWR(`${API_URL}/fiscal/vat?year=${year}&month=${month}`, fetcher)
  if (error) return <div className="empty-state">Impossible de charger le détail du mois.</div>
  if (!m) return <div className="loading-spinner"><div className="spinner" /></div>
  if (m.not_tracked) return <div className="empty-state">Mois antérieur au suivi.</div>
  const L = m.lines
  const shown = CA3_CASES.filter(c => (L[c.key] ?? 0) !== 0 || (c.taxKey && L[c.taxKey]) || ['16', '23', 'TD', '32'].includes(c.code))

  return (
    <div className="fade-in-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>CA3 — {MONTHS[month - 1]} {year}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Échéance {fmtDate(m.due_date)} · <span className={`badge ${statusBadge(m.status)}`}>{m.status}</span>
            {m.declaration?.deposit_number && <> · dépôt {m.declaration.deposit_number}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-outline" href={IMPOTS_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Espace pro impots.gouv</a>
          <button className="btn btn-primary" onClick={() => onFiled(m)}><CheckCircle2 size={15} /> {m.declaration ? 'Modifier le suivi' : 'Marquer comme déposée'}</button>
        </div>
      </div>

      {m.neant ? (
        <div className="inline-form" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Info size={18} color="var(--accent-primary)" />
          <div><b>Déclaration « néant »</b> : aucune opération ce mois-ci. Cochez la case « néant » sur le formulaire.</div>
        </div>
      ) : (
        <>
          <div className="section-title" style={{ fontSize: 15 }}>Cases à recopier</div>
          <div className="vehicles-table-wrap" style={{ marginBottom: 20 }}>
            <table className="data-table">
              <thead><tr><th>Case</th><th>Libellé</th><th style={{ textAlign: 'right' }}>Montant</th><th>Explication</th></tr></thead>
              <tbody>
                {shown.map(c => (
                  <tr key={c.code}>
                    <td><b>{c.code}</b></td>
                    <td>{c.label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {c.taxKey ? <>{eur(L[c.key])} <span className="muted">/</span> {eur(L[c.taxKey])}</> : eur(L[c.key])}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{c.help}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {m.penalty && (
        <div className="inline-form" style={{ borderColor: 'var(--danger)', background: 'var(--danger-light)' }}>
          <b>Déclaration en retard — estimation des pénalités :</b> majoration 10 % = {eur(m.penalty.majoration_10, 2)},
          intérêts de retard 0,20 %/mois × {m.penalty.months} = {eur(m.penalty.interets, 2)} → environ <b>{eur(m.penalty.total, 2)}</b> en plus.
          <div className="form-hint">Estimation indicative : le montant exact est calculé par l'administration.</div>
        </div>
      )}

      {(m.alerts.length > 0) && (
        <div style={{ marginBottom: 20 }}>
          {m.alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, padding: '6px 0', color: a.level === 'danger' ? 'var(--danger)' : a.level === 'warning' ? 'var(--warning)' : 'var(--text-secondary)' }}>
              {a.level === 'info' ? <Info size={15} /> : <AlertTriangle size={15} />} <span>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {m.sales.length > 0 && (
        <>
          <div className="section-title" style={{ fontSize: 15 }}>Ventes — TVA sur la marge</div>
          <div className="vehicles-table-wrap" style={{ marginBottom: 20 }}>
            <table className="data-table">
              <thead><tr><th>Véhicule</th><th>Vendu le</th><th>Prix de vente</th><th>Prix d'achat retenu</th><th>Marge TTC</th><th>Marge HT</th><th>TVA</th></tr></thead>
              <tbody>
                {m.sales.map(s => (
                  <tr key={s.vehicle_id}>
                    <td><Link className="doc-vehicle-link" href={`/app/vehicles/${s.vehicle_id}`}>{s.vehicle}</Link></td>
                    <td>{fmtDate(s.date)}</td>
                    <td>{eur(s.price_sell, 2)}</td>
                    <td>{eur(s.purchase_base, 2)} {s.estimated && <span className="badge badge-doc-attente" title={s.purchase_source}>estimé</span>}</td>
                    <td>{eur(s.margin_ttc, 2)}</td>
                    <td>{eur(s.margin_ht, 2)}</td>
                    <td><b>{eur(s.vat, 2)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {[['autoliquidations', 'Prestations UE — TVA autoliquidée (A3 + 08 + 20)'], ['deductible', 'Achats France — TVA déductible (20)'], ['immobilisations', 'Immobilisations (19)'], ['achats_vehicules', 'Achats de véhicules (base de marge, sans TVA)'], ['sans_tva', 'Dépenses sans TVA']].map(([key, title]) => (
        m[key]?.length > 0 && (
          <div key={key}>
            <div className="section-title" style={{ fontSize: 15 }}>{title}</div>
            <div className="vehicles-table-wrap" style={{ marginBottom: 20 }}>
              <table className="data-table">
                <thead><tr><th>Date</th><th>Pièce</th><th>Véhicule</th><th>Fournisseur</th><th>N° facture</th><th>Montant</th><th>TVA</th><th></th></tr></thead>
                <tbody>
                  {m[key].map(r => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.date)}</td>
                      <td>{r.label || '—'} {!r.has_invoice && <span className="badge badge-doc-expire">sans facture</span>}</td>
                      <td>{r.vehicle || '—'}</td>
                      <td className="muted">{r.supplier || '—'} {r.country && r.country !== 'FR' ? `(${r.country})` : ''}</td>
                      <td className="muted">{r.invoice_ref || '—'}</td>
                      <td>{eur(r.amount_ht, 2)}</td>
                      <td>{r.vat_amount ? eur(r.vat_amount, 2) : '—'}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn-icon" onClick={() => onEditEntry(r)} title="Modifier"><Pencil size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ))}

      {m.unqualified.length > 0 && (
        <>
          <div className="section-title" style={{ fontSize: 15 }}>À qualifier ({m.unqualified.length}) — charges et travaux du dashboard</div>
          <p className="form-hint" style={{ marginTop: -8, marginBottom: 10 }}>
            Indiquez pour chacun s'il y a une facture avec TVA (déductible) ou non. Tant que ce n'est pas fait, rien n'est déduit.
          </p>
          <div className="vehicles-table-wrap" style={{ marginBottom: 20 }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Type</th><th>Véhicule</th><th>Libellé</th><th>Montant</th><th></th></tr></thead>
              <tbody>
                {m.unqualified.map(u => (
                  <tr key={`${u.type}-${u.id}`}>
                    <td>{fmtDate(u.date)}</td>
                    <td className="muted">{u.type}</td>
                    <td>{u.vehicle}</td>
                    <td>{u.label || '—'}</td>
                    <td>{eur(u.amount, 2)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => onQualify(u)}>Qualifier</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────
export default function Fiscalite() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(null)
  const [entryModal, setEntryModal] = useState(null)   // {initial}
  const [filedModal, setFiledModal] = useState(null)   // month object
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [entryMonthFilter, setEntryMonthFilter] = useState('')

  const { data: ov, error, mutate: mutOv } = useSWR(`${API_URL}/fiscal/overview?year=${year}`, fetcher)
  const { data: entries, mutate: mutEntries } = useSWR(`${API_URL}/fiscal/entries?year=${year}`, fetcher)
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)
  const { mutate: mutDetail } = useSWR(month ? `${API_URL}/fiscal/vat?year=${year}&month=${month}` : null, fetcher)

  // Mois sélectionné par défaut : le plus ancien en retard, sinon le dernier mois clos.
  useEffect(() => {
    if (!ov || month) return
    const late = ov.months.find(m => m.status === 'en retard')
    const todo = ov.months.find(m => m.status === 'à faire')
    const last = [...ov.months].reverse().find(m => m.status !== 'en cours' && !m.not_tracked)
    setMonth((late || todo || last || ov.months[0])?.month || 1)
  }, [ov, month])

  const refreshAll = () => { mutOv(); mutEntries(); mutDetail() }

  const filteredEntries = useMemo(() => (entries || []).filter(e => !entryMonthFilter || (e.date && new Date(e.date).getMonth() + 1 === parseInt(entryMonthFilter))), [entries, entryMonthFilter])

  const deleteEntry = async (id) => {
    if (!confirm('Supprimer cette pièce fiscale ?')) return
    try { await api(`/fiscal/entries/${id}`, 'DELETE'); toast.success('Pièce supprimée'); refreshAll() } catch (err) { toast.error(err.message) }
  }

  const qualify = (u) => setEntryModal({
    initial: {
      ...EMPTY_ENTRY, date: u.date, vehicle_id: u.vehicle_id || '', label: u.label, amount_ht: u.amount,
      kind: /commission|da\b|assurance|carte grise/i.test(u.label || '') ? 'sans_tva' : 'achat_fr_tva',
      charge_id: u.type === 'charge' ? u.id : null, intervention_id: u.type === 'travaux' ? u.id : null,
    },
  })

  const years = [2025, 2026, 2027].filter(y => y <= new Date().getFullYear() + 1)

  if (error) return (
    <Layout title="Fiscalité">
      <div className="page-body"><AdminTabs /><div className="empty-state">Erreur de connexion au backend (module fiscal).</div></div>
    </Layout>
  )

  const t = ov?.totals
  return (
    <Layout title="Fiscalité">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fiscalité & déclarations</h1>
          <p className="page-subtitle">TVA sur marge, autoliquidation, IS et échéances — aide à la saisie, rien n'est envoyé aux impôts.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="filter-select" value={year} onChange={e => { setYear(parseInt(e.target.value)); setMonth(null) }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn btn-outline" onClick={() => setSettingsOpen(true)} title="Paramètres fiscaux"><Settings size={16} /></button>
          <button className="btn btn-primary" onClick={() => setEntryModal({ initial: EMPTY_ENTRY })}><Plus size={16} /> Ajouter une pièce</button>
        </div>
      </div>

      <div className="page-body">
        <AdminTabs />

        {!ov && <div className="loading-spinner"><div className="spinner" /> Calcul en cours…</div>}

        {ov && (
          <>
            <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              {ov.settings.company_name} · SIREN {ov.settings.siren} · {ov.settings.sie} · {ov.settings.vat_regime}
            </div>

            <div className="kpi-grid">
              <Kpi title="TVA à payer (non déposée)" value={eur(t.tva_due_unpaid)} sub={`Total TVA nette ${year} : ${eur(t.tva_due)}`} tone={t.tva_due_unpaid > 0 ? 'warning' : undefined} />
              <Kpi title="Déclarations en retard" value={t.late_count} sub={`${t.todo_count} à faire au total`} tone={t.late_count ? 'danger' : undefined} />
              <Kpi title="Pénalités estimées" value={eur(t.penalties_estimate)} sub="Majoration 10 % + intérêts" tone={t.penalties_estimate ? 'danger' : undefined} />
              <Kpi title="CA HT estimé" value={eur(ov.is.ca_ht)} sub={`Ventes TTC ${eur(ov.is.ca_ttc)}`} />
              <Kpi title="IS estimé" value={eur(ov.is.is_estime)} sub={`Résultat estimé ${eur(ov.is.resultat_estime)}`} />
            </div>

            {/* ── TVA mois par mois ── */}
            <div className="card fade-in-up" style={{ marginBottom: 24 }}>
              <div className="card-header"><div className="card-title"><Receipt size={16} /> TVA mois par mois (3310-CA3)</div></div>
              <div className="vehicles-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Mois</th><th>Échéance</th><th>Statut</th><th>Ventes</th><th>A3 (UE)</th><th>TVA brute</th><th>Déductible</th><th>À payer / crédit</th><th>Alertes</th><th></th></tr>
                  </thead>
                  <tbody>
                    {ov.months.map(m => {
                      const L = m.lines || {}
                      return (
                        <tr key={m.month} style={{ background: month === m.month ? 'var(--accent-secondary)' : undefined, cursor: m.not_tracked ? 'default' : 'pointer' }}
                            onClick={() => !m.not_tracked && setMonth(m.month)}>
                          <td><b>{MONTHS[m.month - 1]}</b></td>
                          <td className="muted">{fmtDate(m.due_date)}</td>
                          <td><span className={`badge ${statusBadge(m.status)}`}>{m.status}</span>{m.neant && <span className="muted" style={{ fontSize: 12 }}> · néant</span>}</td>
                          <td>{m.sales_count || '—'}</td>
                          <td>{L.A3 ? eur(L.A3) : '—'}</td>
                          <td>{L['16'] ? eur(L['16']) : '—'}</td>
                          <td>{L['23'] ? eur(L['23']) : '—'}</td>
                          <td style={{ fontWeight: 700, color: L.TD ? 'var(--danger)' : L['27'] ? 'var(--success)' : undefined }}>
                            {L.TD ? eur(L.TD) : L['27'] ? `crédit ${eur(L['27'])}` : (m.not_tracked ? '' : '0 €')}
                          </td>
                          <td>{m.alerts_count ? <span className="badge badge-doc-attente">{m.alerts_count}</span> : '—'}</td>
                          <td style={{ textAlign: 'right' }}>{!m.not_tracked && <span className="doc-link-main" style={{ fontSize: 13 }}>Détail</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {month && (
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-body">
                  <MonthDetail
                    year={year} month={month} vehicles={vehicles}
                    onQualify={qualify}
                    onEditEntry={(r) => { const full = entries?.find(e => e.id === r.id); setEntryModal({ initial: full || r }) }}
                    onFiled={(m) => setFiledModal(m)}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, marginBottom: 24 }}>
              {/* ── Échéances ── */}
              <div className="widget-card">
                <div className="widget-header"><div className="widget-title"><CalendarClock size={16} style={{ verticalAlign: -3 }} /> Échéances {year}</div></div>
                <div className="vehicles-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Déclaration</th><th>Date limite</th><th>Statut</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
                    <tbody>
                      {ov.deadlines.map((d, i) => (
                        <tr key={i}>
                          <td>{d.label}</td>
                          <td className="muted">{fmtDate(d.due_date)}</td>
                          <td><span className={`badge ${statusBadge(d.status)}`}>{d.status}</span></td>
                          <td style={{ textAlign: 'right' }}>{d.amount == null ? '—' : eur(d.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── IS & CVAE ── */}
              <div className="widget-card">
                <div className="widget-header"><div className="widget-title"><Landmark size={16} style={{ verticalAlign: -3 }} /> Impôt sur les sociétés {year} (estimation)</div></div>
                <div className="mini-stat-row"><span className="mini-stat-label">Ventes TTC</span><span className="mini-stat-value">{eur(ov.is.ca_ttc)}</span></div>
                <div className="mini-stat-row"><span className="mini-stat-label">− TVA sur marge</span><span className="mini-stat-value">{eur(ov.is.tva_marge)}</span></div>
                <div className="mini-stat-row"><span className="mini-stat-label">= Chiffre d'affaires HT</span><span className="mini-stat-value">{eur(ov.is.ca_ht)}</span></div>
                <div className="mini-stat-row"><span className="mini-stat-label">− Coût des véhicules vendus</span><span className="mini-stat-value">{eur(ov.is.cout_vehicules_vendus)}</span></div>
                <div className="mini-stat-row"><span className="mini-stat-label">− Travaux (véhicules vendus)</span><span className="mini-stat-value">{eur(ov.is.travaux_vehicules_vendus)}</span></div>
                <div className="mini-stat-row"><span className="mini-stat-label">− Charges</span><span className="mini-stat-value">{eur(ov.is.charges)}</span></div>
                <div className="mini-stat-row"><span className="mini-stat-label">− Commissions</span><span className="mini-stat-value">{eur(ov.is.commissions)}</span></div>
                <div className="mini-stat-row"><span className="mini-stat-label"><b>= Résultat estimé</b></span><span className="mini-stat-value"><b>{eur(ov.is.resultat_estime)}</b></span></div>
                <div className="mini-stat-row"><span className="mini-stat-label">− Déficit reportable</span><span className="mini-stat-value">{eur(ov.is.deficit_reportable)}</span></div>
                <div className="mini-stat-row"><span className="mini-stat-label"><b>IS estimé</b> (15 % / 25 %)</span><span className="mini-stat-value"><b>{eur(ov.is.is_estime)}</b></span></div>
                <div className="mini-stat-row"><span className="mini-stat-label">Stock fin {year} ({ov.is.stock_fin.count} véh.)</span><span className="mini-stat-value">{eur(ov.is.stock_fin.value)}</span></div>
                <div style={{ fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
                  <div><b>Acomptes d'IS :</b> {ov.is.acomptes_dus ? `dus (IS précédent ${eur(ov.is.is_reference_amount)} > 3 000 €).` : `non dus (IS de l'exercice précédent : ${eur(ov.is.is_reference_amount)} ≤ 3 000 €). Si le formulaire 2571 est demandé, il se dépose à 0.`}</div>
                  <div><b>CVAE :</b> {ov.cvae.message}</div>
                  <div><b>Solde d'IS (2572)</b> le {fmtDate(ov.is.solde_date)} · <b>liasse 2065</b> le {fmtDate(ov.is.liasse_date)}.</div>
                  <ul className="muted" style={{ fontSize: 12, paddingLeft: 18, marginTop: 8 }}>
                    {ov.is.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              </div>
            </div>

            {/* ── Pièces fiscales ── */}
            <div className="card fade-in-up">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div className="card-title">Pièces fiscales {year} ({filteredEntries.length})</div>
                <select className="filter-select" value={entryMonthFilter} onChange={e => setEntryMonthFilter(e.target.value)}>
                  <option value="">Tous les mois</option>
                  {MONTHS.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
                </select>
              </div>
              {filteredEntries.length === 0 ? (
                <div className="empty-state">Aucune pièce. Ajoutez vos factures d'achat (véhicule, frais Auto1, pièces, garage…).</div>
              ) : (
                <div className="vehicles-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Type</th><th>Véhicule</th><th>Fournisseur</th><th>N° facture</th><th>Montant</th><th>TVA</th><th>Facture</th><th></th></tr></thead>
                    <tbody>
                      {filteredEntries.map(e => (
                        <tr key={e.id}>
                          <td>{fmtDate(e.date)}</td>
                          <td style={{ fontSize: 12 }}>{ENTRY_KINDS[e.kind] || e.kind}</td>
                          <td>{e.vehicle || '—'}</td>
                          <td className="muted">{e.supplier || '—'}</td>
                          <td className="muted">{e.invoice_ref || '—'}</td>
                          <td>{eur(e.amount_ht, 2)}</td>
                          <td>{e.kind === 'service_ue' ? <span className="muted">autoliq. {eur((e.amount_ht || 0) * (e.vat_rate || 20) / 100, 2)}</span> : (e.vat_amount ? eur(e.vat_amount, 2) : '—')}</td>
                          <td>{e.has_invoice ? <CheckCircle2 size={15} color="var(--success)" /> : <span className="badge badge-doc-expire">non</span>}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn-icon" onClick={() => setEntryModal({ initial: e })} title="Modifier"><Pencil size={14} /></button>
                            <button className="btn-icon danger" onClick={() => deleteEntry(e.id)} title="Supprimer"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {entryModal && (
        <Modal title={entryModal.initial?.id ? 'Modifier la pièce fiscale' : 'Nouvelle pièce fiscale'} onClose={() => setEntryModal(null)}>
          <EntryForm initial={entryModal.initial} vehicles={vehicles} onCancel={() => setEntryModal(null)} onSaved={() => { setEntryModal(null); refreshAll() }} />
        </Modal>
      )}
      {filedModal && (
        <Modal title={`Suivi CA3 — ${MONTHS[filedModal.month - 1]} ${year}`} onClose={() => setFiledModal(null)} width={560}>
          <FiledForm month={filedModal} year={year} current={filedModal.declaration} onCancel={() => setFiledModal(null)} onSaved={() => { setFiledModal(null); refreshAll() }} />
        </Modal>
      )}
      {settingsOpen && ov && (
        <Modal title="Paramètres fiscaux" onClose={() => setSettingsOpen(false)}>
          <SettingsForm settings={ov.settings} onCancel={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); refreshAll() }} />
        </Modal>
      )}
    </Layout>
  )
}
