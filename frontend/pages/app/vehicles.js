import { useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import Link from 'next/link'
import Layout from '../../components/Layout'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function fmtKm(km) {
  if (km == null) return '—'
  return new Intl.NumberFormat('fr-FR').format(km) + ' km'
}

function StatusBadge({ status }) {
  if (!status) return null
  const s = status.toLowerCase()
  const cls = s.includes('stock') ? 'badge-stock'
    : s.includes('vendu') ? 'badge-vendu'
    : s.includes('rép') || s.includes('rep') ? 'badge-reparation'
    : s.includes('rés') ? 'badge-reparation'
    : 'badge-vendu'
  return <span className={`badge ${cls}`}>{status}</span>
}

export default function Vehicles() {
  const router = useRouter()
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('')
  const [fuel,    setFuel]    = useState('')
  const [sort,    setSort]    = useState('created_at')

  // Build query string
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (status) params.set('status', status)
  if (fuel)   params.set('fuel',   fuel)
  if (sort)   params.set('sort',   sort)

  const { data: vehicles, error, mutate } = useSWR(
    `${API_URL}/vehicles?${params}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const goToDetail = (id) => router.push(`/app/vehicles/${id}`)

  return (
    <Layout title="Véhicules">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title">Véhicules</h1>
            <p className="page-subtitle">
              {vehicles ? `${vehicles.length} véhicule(s) trouvé(s)` : 'Chargement...'}
            </p>
          </div>
          <Link href="/app/vehicles/new" className="btn btn-primary">
            + Ajouter un véhicule
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* ── Barre de recherche + filtres ── */}
        <div className="search-filter-bar">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Rechercher par marque, modèle, immatriculation, couleur..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="en stock">En stock</option>
            <option value="vendu">Vendu</option>
            <option value="en réparation">En réparation</option>
            <option value="réservé">Réservé</option>
            <option value="hors service">Hors service</option>
          </select>

          <select className="filter-select" value={fuel} onChange={e => setFuel(e.target.value)}>
            <option value="">Toutes énergies</option>
            <option value="Essence">Essence</option>
            <option value="Diesel">Diesel</option>
            <option value="Électrique">Électrique</option>
            <option value="Hybride">Hybride</option>
          </select>

          <select className="filter-select" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="created_at">Ajout récent</option>
            <option value="date_buy">Date achat</option>
            <option value="price_buy">Prix achat</option>
            <option value="brand">Marque A-Z</option>
            <option value="year">Année</option>
            <option value="km">Kilométrage</option>
          </select>

          {(search || status || fuel) && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 13, padding: '7px 12px' }}
              onClick={() => { setSearch(''); setStatus(''); setFuel('') }}
            >
              ✕ Réinitialiser
            </button>
          )}
        </div>

        {/* ── Contenu ── */}
        {error && (
          <div className="card">
            <div className="card-body">
              <div className="empty-state">⚠️ Impossible de contacter le backend.</div>
            </div>
          </div>
        )}

        {!error && !vehicles && (
          <div className="loading-spinner"><div className="spinner" /> Chargement...</div>
        )}

        {vehicles && vehicles.length === 0 && (
          <div className="card">
            <div className="card-body">
              <div className="empty-state">
                {search || status || fuel
                  ? '🔍 Aucun véhicule ne correspond aux filtres.'
                  : '🚗 Aucun véhicule. Commencez par en ajouter un !'}
              </div>
            </div>
          </div>
        )}

        {vehicles && vehicles.length > 0 && (
          <div className="card fade-in-up">
            <div className="vehicles-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 60, textAlign: 'center' }}>Photo</th>
                    <th>Véhicule</th>
                    <th>Immat.</th>
                    <th>Année</th>
                    <th>Énergie</th>
                    <th>Kilométrage</th>
                    <th>Achat</th>
                    <th>Vente</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map(v => (
                    <tr
                      key={v.id}
                      className="vehicle-row"
                      onClick={() => goToDetail(v.id)}
                    >
                      <td style={{ textAlign: 'center' }}>
                        {v.main_image_url ? (
                          <div style={{
                            width: 50, height: 50, borderRadius: '6px', overflow: 'hidden',
                            backgroundImage: `url(${API_URL}${v.main_image_url})`,
                            backgroundSize: 'cover', backgroundPosition: 'center', margin: '0 auto'
                          }} />
                        ) : (
                          <div style={{
                            width: 50, height: 50, borderRadius: '6px',
                            background: 'var(--surface-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-muted)', fontSize: 12, margin: '0 auto', border: '1px solid var(--border)'
                          }}>
                            Aucune
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="vehicle-brand">{v.brand} {v.model}</div>
                        {v.version && <div className="vehicle-model">{v.version}</div>}
                      </td>
                      <td>
                        {v.registration
                          ? <span className="vehicle-reg">{v.registration}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="muted">{v.year ?? '—'}</td>
                      <td className="muted">{v.fuel ?? '—'}</td>
                      <td className="muted">{fmtKm(v.km)}</td>
                      <td>{fmt(v.price_buy)}</td>
                      <td>
                        {v.price_sell ? (
                          <span style={{ color: (v.price_sell - v.price_buy) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                            {fmt(v.price_sell)}
                          </span>
                        ) : '—'}
                      </td>
                      <td><StatusBadge status={v.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
