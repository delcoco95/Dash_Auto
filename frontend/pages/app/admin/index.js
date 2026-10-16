import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import Layout from '../../../components/Layout'
import AdminTabs from '../../../components/AdminTabs'
import { EditModal, DeclRow } from '../../../components/Declarations'
import { API_URL } from '../../../lib/api'
import { fmt } from '../../../lib/format'
import { AlertTriangle, CalendarClock, ListChecks, ArrowRight, CheckCircle2, Calculator, FilePlus2 } from 'lucide-react'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })

export default function AdminOverview() {
  const year = new Date().getFullYear()
  const { data: decls, error, mutate } = useSWR(`${API_URL}/admin/declarations?year=${year}`, fetcher)
  const { data: proofs } = useSWR(`${API_URL}/admin/justificatifs`, fetcher)
  const [edit, setEdit] = useState(null)

  const today = new Date()
  const in30 = new Date(Date.now() + 30 * 864e5)
  const late = (decls || []).filter(d => d.state === 'en retard')
  const unpaid = (decls || []).filter(d => d.state === 'à payer')
  const todo = (decls || []).filter(d => d.state === 'à déposer')
  const soon = todo.filter(d => new Date(d.due_date) <= in30)
  const next = todo.filter(d => new Date(d.due_date) > in30).slice(0, 4)
  const done = (decls || []).filter(d => d.state === 'terminée')
  const pt = proofs?.totals
  const unpaidAmount = unpaid.reduce((a, d) => a + (d.amount || 0), 0)

  return (
    <Layout title="Administratif">
      <div className="page-header">
        <div>
          <h1 className="page-title">Administratif</h1>
          <p className="page-subtitle">Vos déclarations et vos justificatifs, en un coup d'œil.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/app/admin/simulateur" className="btn btn-outline"><Calculator size={16} /> Simuler</Link>
          <Link href="/app/admin/justificatifs" className="btn btn-primary"><FilePlus2 size={16} /> Ajouter un justificatif</Link>
        </div>
      </div>

      <div className="page-body">
        <AdminTabs />
        {error && <div className="empty-state">Erreur de connexion au backend.</div>}
        {!decls && !error && <div className="loading-spinner"><div className="spinner" /> Chargement…</div>}

        {decls && (
          <>
            <div className="kpi-grid">
              <Link href="/app/admin/declarations" className="kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="kpi-title">À déposer</div>
                <div className="kpi-value" style={{ color: late.length ? 'var(--danger)' : undefined }}>{todo.length + late.length}</div>
                <div className="kpi-trend">{late.length ? `dont ${late.length} en retard` : 'aucune en retard'}</div>
              </Link>
              <Link href="/app/admin/declarations" className="kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="kpi-title">Déposées, pas payées</div>
                <div className="kpi-value" style={{ color: unpaid.length ? 'var(--warning)' : undefined }}>{unpaid.length}</div>
                <div className="kpi-trend">{unpaid.length ? `${fmt(unpaidAmount)} à payer` : 'rien à payer'}</div>
              </Link>
              <Link href="/app/admin/declarations" className="kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="kpi-title">Déposées et payées</div>
                <div className="kpi-value" style={{ color: 'var(--success)' }}>{done.length}</div>
                <div className="kpi-trend">en {year}</div>
              </Link>
              <Link href="/app/admin/justificatifs" className="kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="kpi-title">Justificatifs manquants</div>
                <div className="kpi-value" style={{ color: pt?.missing ? 'var(--danger)' : undefined }}>{pt ? pt.missing : '…'}</div>
                <div className="kpi-trend">{pt ? `${pt.ok} en main sur ${pt.count}` : ''}</div>
              </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24 }}>
              <div className="card" style={{ padding: 0 }}>
                <div className="card-header"><div className="card-title"><AlertTriangle size={16} /> À faire maintenant</div></div>
                {[...late, ...unpaid, ...soon].map(d => <DeclRow key={d.key} d={d} onEdit={setEdit} onChanged={mutate} />)}
                {pt?.missing > 0 && (
                  <Link href="/app/admin/justificatifs" className="check-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <ListChecks size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div className="check-item-title">{pt.missing} justificatif{pt.missing > 1 ? 's' : ''} manquant{pt.missing > 1 ? 's' : ''}</div>
                        <div className="check-item-meta">{fmt(pt.missing_amount)} de dépenses sans facture</div>
                      </div>
                    </div>
                    <span className="file-btn ghost">Compléter <ArrowRight size={13} /></span>
                  </Link>
                )}
                {!late.length && !unpaid.length && !soon.length && !pt?.missing && (
                  <div className="check-item"><div style={{ display: 'flex', gap: 10 }}><CheckCircle2 size={18} color="var(--success)" /> Tout est à jour.</div></div>
                )}
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div className="card-header"><div className="card-title"><CalendarClock size={16} /> Prochaines échéances</div></div>
                {next.map(d => <DeclRow key={d.key} d={d} onEdit={setEdit} onChanged={mutate} />)}
                {next.length === 0 && <div className="check-item"><span className="muted">Aucune autre échéance cette année.</span></div>}
                <Link href="/app/admin/simulateur" className="check-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Calculator size={18} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div className="check-item-title">Simuler une déclaration</div>
                      <div className="check-item-meta">Estimer la TVA d'un mois ou l'impôt sur les sociétés de l'année</div>
                    </div>
                  </div>
                  <span className="file-btn ghost">Ouvrir <ArrowRight size={13} /></span>
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
      {edit && <EditModal decl={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); mutate() }} />}
    </Layout>
  )
}
