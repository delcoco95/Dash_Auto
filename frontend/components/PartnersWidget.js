/**
 * Widget « Associés » du tableau de bord : qui achète / vend, investissements et commissions.
 * Indépendant du profit net et des charges.
 */
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowUpRight, Plus, Users, AlertTriangle } from 'lucide-react'
import { API_URL } from '../lib/api'
import { fmt, fmtDate } from '../lib/format'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json() })

export function initials(name) {
  return (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function PartnersWidget() {
  const { data, error } = useSWR(`${API_URL}/partners/summary`, fetcher)

  return (
    <div className="widget-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="widget-header">
        <div className="widget-title"><Users size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Associés</div>
        <Link href="/app/associes" className="kpi-icon-wrapper" style={{ background: 'transparent', border: 'none' }} aria-label="Ouvrir">
          <ArrowUpRight size={16} color="var(--text-primary)" />
        </Link>
      </div>

      {error && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Indisponible.</p>}
      {!data && !error && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}

      {data && (
        <div style={{ flex: 1 }}>
          {data.by_partner.map(p => (
            <div key={p.partner} className="partner-row">
              <div className="partner-avatar">{initials(p.partner)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.partner}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {p.bought} acheté{p.bought > 1 ? 's' : ''} · {p.sold} vendu{p.sold > 1 ? 's' : ''}{p.invested ? ` · investi ${fmt(p.invested)}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{fmt(p.commission)}</div>
                <div style={{ fontSize: 11, color: p.commission_due ? 'var(--warning)' : 'var(--text-muted)' }}>
                  {p.commission_due ? `${fmt(p.commission_due)} à verser` : 'commissions'}
                </div>
              </div>
            </div>
          ))}

          {data.recent.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Dernières commissions</div>
              {data.recent.slice(0, 3).map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '4px 0' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <b>{c.partner}</b> · {c.vehicle || 'Sans véhicule'}{c.date ? ` · ${fmtDate(c.date)}` : ''}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>{fmt(c.commission)}</span>
                </div>
              ))}
            </div>
          )}

          {data.unassigned > 0 && (
            <Link href="/app/associes?filtre=a-renseigner" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--warning)', marginTop: 10 }}>
              <AlertTriangle size={13} /> {data.unassigned} véhicule(s) sans acheteur / vendeur renseigné
            </Link>
          )}
        </div>
      )}

      <Link href="/app/associes?ajouter=1" className="btn btn-primary" style={{ width: '100%', marginTop: 14 }}>
        <Plus size={16} /> Ajouter une commission
      </Link>
    </div>
  )
}
