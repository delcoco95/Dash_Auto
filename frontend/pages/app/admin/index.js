import useSWR from 'swr'
import Link from 'next/link'
import Layout from '../../../components/Layout'
import AdminTabs from '../../../components/AdminTabs'
import { API_URL } from '../../../lib/api'
import { fmtDate } from '../../../lib/format'
import { MONTHS, statusBadge, eur } from '../../../lib/fiscal'
import { AlertTriangle, CalendarClock, ListChecks, Receipt, ArrowRight, CheckCircle2, FilePlus2, Car } from 'lucide-react'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })

function ActionRow({ icon: Icon, tone = 'warning', title, sub, href, cta }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'ok' ? 'var(--success)' : 'var(--warning)'
  return (
    <Link href={href} className="check-item" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icon size={18} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <div className="check-item-title">{title}</div>
          {sub && <div className="check-item-meta">{sub}</div>}
        </div>
      </div>
      <span className="file-btn ghost">{cta} <ArrowRight size={13} /></span>
    </Link>
  )
}

export default function AdminOverview() {
  const year = new Date().getFullYear()
  const { data: ov, error } = useSWR(`${API_URL}/fiscal/overview?year=${year}`, fetcher)
  const { data: cl } = useSWR(`${API_URL}/fiscal/checklist?year=${year}`, fetcher)
  const { data: upcoming } = useSWR(`${API_URL}/fiscal/upcoming?days=30`, fetcher)

  const t = ov?.totals
  const ct = cl?.totals
  const rectif = (ov?.months || []).filter(m => m.status === 'à rectifier')
  const late = (ov?.months || []).filter(m => m.status === 'en retard')
  const todo = (ov?.months || []).filter(m => m.status === 'à faire')

  return (
    <Layout title="Administratif">
      <div className="page-header">
        <div>
          <h1 className="page-title">Administratif</h1>
          <p className="page-subtitle">Ce qu'il faut faire maintenant, vos échéances et vos justificatifs.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/app/vehicles/new" className="btn btn-outline"><Car size={16} /> Acheter un véhicule</Link>
          <Link href="/app/admin/justificatifs" className="btn btn-primary"><FilePlus2 size={16} /> Ajouter un justificatif</Link>
        </div>
      </div>

      <div className="page-body">
        <AdminTabs />
        {error && <div className="empty-state">Erreur de connexion au backend.</div>}
        {!ov && !error && <div className="loading-spinner"><div className="spinner" /> Chargement…</div>}

        {ov && (
          <>
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-card-header"><div className="kpi-title">À régulariser</div></div>
                <div className="kpi-value" style={{ color: t.to_rectify_amount > 0 ? 'var(--danger)' : undefined }}>{eur(t.to_rectify_amount || 0)}</div>
                <div className="kpi-trend">{t.to_rectify_count || 0} déclaration(s) à rectifier</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-card-header"><div className="kpi-title">Déclarations en retard</div></div>
                <div className="kpi-value" style={{ color: t.late_count ? 'var(--danger)' : undefined }}>{t.late_count}</div>
                <div className="kpi-trend">{t.todo_count} à faire au total</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-card-header"><div className="kpi-title">Justificatifs manquants</div></div>
                <div className="kpi-value" style={{ color: ct?.todo_mandatory ? 'var(--warning)' : undefined }}>{ct ? ct.todo_mandatory : '…'}</div>
                <div className="kpi-trend">obligatoires · {ct ? eur(ct.vat_unjustified) : '…'} de TVA à justifier</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-card-header"><div className="kpi-title">Dossier complet</div></div>
                <div className="kpi-value">{ct && ct.count ? Math.round(100 * ct.done / ct.count) : 0} %</div>
                <div className="kpi-trend">{ct ? `${ct.done} / ${ct.count} pièces` : ''}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24 }}>
              <div className="card">
                <div className="card-header"><div className="card-title"><AlertTriangle size={16} /> À faire maintenant</div></div>
                {rectif.map(m => (
                  <ActionRow key={`r${m.month}`} icon={AlertTriangle} tone="danger" href={`/app/documents/fiscalite?month=${m.month}`} cta="Corriger"
                    title={`Rectifier la TVA de ${MONTHS[m.month - 1].toLowerCase()} ${year}`}
                    sub={<>Déclaré {eur(m.rectification?.declared_due)} · réel {eur(m.lines?.TD)} · <b>écart {eur(m.rectification?.difference)}</b></>} />
                ))}
                {late.map(m => (
                  <ActionRow key={`l${m.month}`} icon={AlertTriangle} tone="danger" href={`/app/documents/fiscalite?month=${m.month}`} cta="Déclarer"
                    title={`Déposer la TVA de ${MONTHS[m.month - 1].toLowerCase()} ${year} (en retard)`} sub={`À payer : ${eur(m.lines?.TD)}`} />
                ))}
                {todo.map(m => (
                  <ActionRow key={`t${m.month}`} icon={Receipt} href={`/app/documents/fiscalite?month=${m.month}`} cta="Préparer"
                    title={`TVA de ${MONTHS[m.month - 1].toLowerCase()} ${year}`} sub={`Avant le ${fmtDate(m.due_date)} · ${eur(m.lines?.TD)} à payer`} />
                ))}
                {ct?.todo_mandatory > 0 && (
                  <ActionRow icon={ListChecks} href="/app/admin/justificatifs?filtre=obligatoire" cta="Compléter"
                    title={`${ct.todo_mandatory} justificatifs obligatoires à retrouver`} sub="Factures, certificats de cession, preuves de paiement" />
                )}
                {!rectif.length && !late.length && !todo.length && !ct?.todo_mandatory && (
                  <div className="check-item"><div style={{ display: 'flex', gap: 10 }}><CheckCircle2 size={18} color="var(--success)" /> Tout est à jour.</div></div>
                )}
              </div>

              <div className="card">
                <div className="card-header"><div className="card-title"><CalendarClock size={16} /> Échéances {year}</div></div>
                {ov.deadlines.filter(d => !['déposée', 'payée', 'non dû', 'non due'].includes(d.status) || new Date(d.due_date) >= new Date(Date.now() - 31 * 864e5)).map((d, i) => (
                  <div key={i} className="check-item">
                    <div>
                      <div className="check-item-title">{d.month ? <Link className="doc-link-main" href={`/app/documents/fiscalite?month=${d.month}`}>{d.label}</Link> : d.label}</div>
                      <div className="check-item-meta"><span>Avant le {fmtDate(d.due_date)}</span>{d.amount ? <span>{eur(d.amount)}</span> : null}</div>
                    </div>
                    <span className={`badge ${statusBadge(d.status)}`}>{d.status}</span>
                  </div>
                ))}
                {Array.isArray(upcoming) && upcoming.length > 0 && (
                  <div className="form-hint" style={{ padding: '10px 18px' }}>Un bandeau d'alerte s'affiche sur toutes les pages tant qu'une échéance approche ou qu'une déclaration est en retard.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
