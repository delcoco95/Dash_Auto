/**
 * Justificatifs : une pièce attendue pour chaque achat de véhicule, vente, charge et travail payé.
 * Combien on en a, combien il en manque, et dépôt du fichier directement sur la ligne.
 */
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Layout from '../../../components/Layout'
import AdminTabs from '../../../components/AdminTabs'
import ProofRow from '../../../components/ProofRow'
import FilePreviewModal from '../../../components/FilePreviewModal'
import { API_URL } from '../../../lib/api'
import { fmt } from '../../../lib/format'
import { PROOF_KIND } from '../../../lib/admin'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })

export default function Justificatifs() {
  const { data, error, mutate } = useSWR(`${API_URL}/admin/justificatifs`, fetcher)
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)
  const [status, setStatus] = useState('manquant')
  const [kind, setKind] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [preview, setPreview] = useState(null)

  const items = useMemo(() => (data?.items || []).filter(i =>
    (!status || (status === 'ok' ? i.status !== 'manquant' : i.status === status)) && (!kind || i.kind === kind) && (!vehicle || String(i.vehicle_id) === vehicle)), [data, status, kind, vehicle])

  const t = data?.totals
  return (
    <Layout title="Justificatifs">
      <div className="page-header">
        <div>
          <h1 className="page-title">Justificatifs</h1>
          <p className="page-subtitle">Une pièce par achat, vente, charge et travail payé. Déposez la facture (ou une photo) directement sur la ligne.</p>
        </div>
      </div>
      <div className="page-body">
        <AdminTabs />
        {error && <div className="empty-state">Erreur de connexion au backend.</div>}
        {!data && !error && <div className="loading-spinner"><div className="spinner" /></div>}
        {data && (
          <>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-title">Pièces attendues</div><div className="kpi-value">{t.count}</div>
                <div className="kpi-trend">{t.not_applicable ? `dont ${t.not_applicable} sans facture possible` : 'achats, ventes, charges, travaux'}</div></div>
              <div className="kpi-card"><div className="kpi-title">Pièces en main</div><div className="kpi-value" style={{ color: 'var(--success)' }}>{t.ok}</div>
                <div className="kpi-trend">{t.count ? Math.round(100 * (t.ok + t.not_applicable) / t.count) : 0} % du dossier</div></div>
              <div className="kpi-card"><div className="kpi-title">Pièces manquantes</div><div className="kpi-value" style={{ color: t.missing ? 'var(--danger)' : undefined }}>{t.missing}</div>
                <div className="kpi-trend">pour {fmt(t.missing_amount)} de dépenses</div></div>
            </div>

            <div className="proof-kinds">
              {Object.entries(PROOF_KIND).map(([k, l]) => {
                const b = data.by_kind[k] || { count: 0, ok: 0, missing: 0 }
                return (
                  <button key={k} className={`proof-kind${kind === k ? ' active' : ''}`} onClick={() => setKind(kind === k ? '' : k)}>
                    <span>{l}</span>
                    <b>{b.ok} / {b.count}</b>
                    {b.missing > 0 && <em>{b.missing} manquante{b.missing > 1 ? 's' : ''}</em>}
                  </button>
                )
              })}
            </div>

            <div className="search-filter-bar">
              <div className="segmented">
                {[['manquant', `Manquantes (${t.missing})`], ['ok', 'En main'], ['', 'Toutes']].map(([k, l]) => (
                  <button key={k} className={`segmented-btn${status === k ? ' active' : ''}`} onClick={() => setStatus(k)}>{l}</button>
                ))}
              </div>
              <select className="filter-select" value={vehicle} onChange={e => setVehicle(e.target.value)}>
                <option value="">Tous les véhicules</option>
                {vehicles?.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.registration || ''}</option>)}
              </select>
            </div>

            <div className="card" style={{ padding: 0 }}>
              {items.length === 0 && <div className="empty-state">{status === 'manquant' ? 'Aucune pièce manquante.' : 'Rien ici.'}</div>}
              {items.map(it => <ProofRow key={it.key} it={it} onChanged={mutate} onPreview={setPreview} />)}
            </div>
          </>
        )}
      </div>
      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
    </Layout>
  )
}
