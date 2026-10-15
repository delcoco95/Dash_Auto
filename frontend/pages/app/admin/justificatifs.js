import { useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { toast } from 'react-hot-toast'
import Layout from '../../../components/Layout'
import AdminTabs from '../../../components/AdminTabs'
import FilePreviewModal from '../../../components/FilePreviewModal'
import { API_URL } from '../../../lib/api'
import { fmtDate } from '../../../lib/format'
import { MONTHS, eur } from '../../../lib/fiscal'
import { uploadDocument, setChecklist } from '../../../lib/upload'
import { ChevronDown, ChevronRight, Upload, Paperclip, ExternalLink, Camera } from 'lucide-react'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
const STATUS_PILLS = [
  { v: 'à trouver', cls: 'on-todo', label: 'À trouver' },
  { v: 'trouvé', cls: 'on-found', label: 'Trouvé' },
  { v: 'classé', cls: 'on-filed', label: 'Classé' },
  { v: 'non applicable', cls: 'on-na', label: 'N/A' },
]
const CATEGORY_FOR_DOC = {
  'Vente': 'DV - Vente', 'Achat véhicule': 'Facture', 'Frais UE (autoliquidation)': 'Facture',
  'Facture avec TVA déduite': 'Facture', 'Immobilisation': 'Facture', 'Dépense sans TVA (IS)': 'Facture', 'Déclaration': 'Autre',
}

function Item({ it, onChanged, onPreview }) {
  const fileRef = useRef()
  const [busy, setBusy] = useState(false)

  const setStatus = async (status) => {
    try { await setChecklist(it.key, { status }); onChanged() } catch (e) { toast.error(e.message) }
  }
  const attach = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const doc = await uploadDocument({
        file, vehicleId: it.vehicle_id, category: it.key.startsWith('sale_cession') ? 'DV - Vente' : (CATEGORY_FOR_DOC[it.category] || 'Autre'),
        name: `${it.piece}${it.registration ? ` — ${it.registration}` : ''}${it.ref ? ` (${it.ref})` : ''}`,
        date: it.date || null, amount: it.amount || null, description: it.description || null,
      })
      await setChecklist(it.key, { document_id: doc.id, status: 'classé' })
      toast.success('Justificatif classé')
      onChanged()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="check-item">
      <div>
        <div className="check-item-title">
          {it.piece}
          {it.priority === 'obligatoire' && <span className="tag-mandatory" title="Justifie un montant de TVA déclaré"> · obligatoire</span>}
        </div>
        <div className="check-item-meta">
          {it.vehicle_id ? <Link className="doc-vehicle-link" href={`/app/vehicles/${it.vehicle_id}`}>{it.vehicle}</Link> : <span>{it.description}</span>}
          {it.vehicle_id && it.description && <span>{it.description}</span>}
          {it.date && <span>{fmtDate(it.date)}</span>}
          {it.amount != null && <span>{eur(it.amount, 2)}</span>}
          {it.vat ? <span>TVA {eur(it.vat, 2)} (case {it.case})</span> : null}
          {it.ref && <span>n° {it.ref}</span>}
        </div>
        <div className="check-item-meta">
          <span>Où la trouver : {it.where}</span>
          {it.link && <a href={it.link} target="_blank" rel="noreferrer" className="doc-link-main">Formulaire officiel <ExternalLink size={11} /></a>}
          {it.document && <span className="doc-link-main" style={{ cursor: 'pointer' }} onClick={() => onPreview(it.document)}><Paperclip size={11} /> {it.document.name}</span>}
        </div>
      </div>
      <div className="check-item-actions">
        {STATUS_PILLS.map(p => (
          <button key={p.v} className={`pill ${it.status === p.v ? p.cls : ''}`} onClick={() => setStatus(p.v)}>{p.label}</button>
        ))}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={e => attach(e.target.files?.[0])} />
        <button className="file-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Envoi…' : <><Camera size={13} /> <Upload size={13} /> Fichier</>}
        </button>
      </div>
    </div>
  )
}

export default function Justificatifs() {
  const router = useRouter()
  const year = new Date().getFullYear()
  const { data, error, mutate } = useSWR(`${API_URL}/fiscal/checklist?year=${year}`, fetcher)
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)
  const [status, setStatus] = useState(router.query.filtre === 'obligatoire' ? 'à trouver' : '')
  const [priority, setPriority] = useState(router.query.filtre === 'obligatoire' ? 'obligatoire' : '')
  const [vehicle, setVehicle] = useState('')
  const [open, setOpen] = useState({})
  const [preview, setPreview] = useState(null)

  const items = useMemo(() => (data?.items || []).filter(i =>
    (!status || i.status === status) && (!priority || i.priority === priority) && (!vehicle || String(i.vehicle_id) === vehicle)), [data, status, priority, vehicle])
  const byMonth = useMemo(() => {
    const g = {}
    for (const i of items) (g[i.month] = g[i.month] || []).push(i)
    return Object.entries(g).sort((a, b) => b[0] - a[0])
  }, [items])
  const allByMonth = useMemo(() => {
    const g = {}
    for (const i of data?.items || []) (g[i.month] = g[i.month] || []).push(i)
    return g
  }, [data])

  return (
    <Layout title="Justificatifs">
      <div className="page-header">
        <div>
          <h1 className="page-title">Justificatifs</h1>
          <p className="page-subtitle">Tout ce qu'il faut pouvoir présenter en cas de contrôle, mois par mois. Prenez en photo ou déposez le fichier directement sur la ligne.</p>
        </div>
      </div>
      <div className="page-body">
        <AdminTabs />
        {error && <div className="empty-state">Erreur de connexion au backend.</div>}
        {!data && !error && <div className="loading-spinner"><div className="spinner" /></div>}
        {data && (
          <>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-title">Pièces attendues</div><div className="kpi-value">{data.totals.count}</div></div>
              <div className="kpi-card"><div className="kpi-title">À trouver</div><div className="kpi-value" style={{ color: 'var(--danger)' }}>{data.totals.todo}</div><div className="kpi-trend">dont {data.totals.todo_mandatory} obligatoires</div></div>
              <div className="kpi-card"><div className="kpi-title">TVA non justifiée</div><div className="kpi-value">{eur(data.totals.vat_unjustified)}</div><div className="kpi-trend">sur les pièces obligatoires manquantes</div></div>
              <div className="kpi-card"><div className="kpi-title">Dossier complet</div><div className="kpi-value">{data.totals.count ? Math.round(100 * data.totals.done / data.totals.count) : 0} %</div></div>
            </div>

            <div className="search-filter-bar">
              <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Tous les statuts</option>
                {STATUS_PILLS.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}
              </select>
              <select className="filter-select" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="">Toutes priorités</option>
                <option value="obligatoire">Obligatoires</option>
                <option value="recommandé">Recommandées</option>
              </select>
              <select className="filter-select" value={vehicle} onChange={e => setVehicle(e.target.value)}>
                <option value="">Tous les véhicules</option>
                {vehicles?.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.registration || ''}</option>)}
              </select>
            </div>

            {byMonth.length === 0 && <div className="card"><div className="empty-state">Aucune pièce pour ces filtres.</div></div>}
            {byMonth.map(([m, list]) => {
              const all = allByMonth[m] || []
              const done = all.filter(i => i.status !== 'à trouver').length
              const isOpen = open[m] ?? (list.some(i => i.status === 'à trouver'))
              return (
                <div key={m} className="card check-month">
                  <div className="check-month-head" onClick={() => setOpen(o => ({ ...o, [m]: !isOpen }))}>
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <h3>{MONTHS[m - 1]} {year}</h3>
                    <div className="progress" title={`${done}/${all.length}`}><span style={{ width: `${all.length ? 100 * done / all.length : 0}%` }} /></div>
                    <span className="muted" style={{ fontSize: 12 }}>{done}/{all.length} · {all.filter(i => i.status === 'à trouver' && i.priority === 'obligatoire').length} obligatoire(s) manquant(s)</span>
                  </div>
                  {isOpen && list.map(it => <Item key={it.key} it={it} onChanged={mutate} onPreview={(d) => setPreview({ url: d.url, name: d.name, type: d.type })} />)}
                </div>
              )
            })}
          </>
        )}
      </div>
      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
    </Layout>
  )
}
