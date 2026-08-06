import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import Layout from '../../../components/Layout'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
const fmtAmt = (n) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const DOC_CATS = ['Photo', 'Facture', 'Contrôle technique', 'Carte grise', 'Assurance', 'Devis', 'Contrat', 'Rapport', 'Autre']
const DOC_STATUSES = ['valide', 'expiré', 'en attente', 'archivé']

export default function DocumentsGlobal() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [sort, setSort] = useState('created_desc')

  // Build query
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (category) params.set('category', category)
  if (status) params.set('status', status)
  if (sort) params.set('sort', sort)
  if (vehicleFilter === 'unclassified') params.set('vehicle_id', '-1')
  else if (vehicleFilter) params.set('vehicle_id', vehicleFilter)

  const { data: docs, error, mutate } = useSWR(`${API_URL}/documents?${params}`, fetcher)
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)

  const docIcon = (type) => {
    if (!type) return '📄'
    if (type.startsWith('image/')) return '🖼️'
    if (type.includes('pdf')) return '📕'
    if (type.includes('word') || type.includes('doc')) return '📘'
    if (type.includes('excel') || type.includes('sheet') || type.includes('xls')) return '📗'
    return '📄'
  }

  const deleteDoc = async (id) => {
    if (!confirm('Supprimer ce document définitivement ?')) return
    await fetch(`${API_URL}/documents/${id}`, { method: 'DELETE' })
    mutate()
  }

  const isExpiring = (expDate, docStatus) => {
    if (docStatus === 'archivé') return false
    if (!expDate) return false
    const d = new Date(expDate)
    const now = new Date()
    const diffDays = (d - now) / (1000 * 60 * 60 * 24)
    return diffDays < 30 && diffDays >= 0
  }

  const isExpired = (expDate, docStatus) => {
    if (docStatus === 'archivé') return false
    if (!expDate) return false
    return new Date(expDate) < new Date()
  }

  return (
    <Layout title="Tous les Documents">
      <div className="page-header">
        <h1 className="page-title">📎 Documents centralisés</h1>
        <p className="page-subtitle">Gérez toutes les factures, contrats et documents administratifs du parc.</p>
      </div>

      <div className="page-body">
        {/* ── Filtres ── */}
        <div className="search-filter-bar">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Rechercher un document..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select className="filter-select" value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}>
            <option value="">Tous les véhicules</option>
            <option value="unclassified">⚠️ Non classés (Aucun véhicule)</option>
            {vehicles?.map(v => (
              <option key={v.id} value={v.id}>{v.registration || v.vin || `${v.brand} ${v.model}`}</option>
            ))}
          </select>

          <select className="filter-select" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Toutes catégories</option>
            {DOC_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            {DOC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select className="filter-select" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="created_desc">Plus récents (ajout)</option>
            <option value="date_desc">Date du document (récent)</option>
            <option value="date_asc">Date du document (ancien)</option>
            <option value="amount_desc">Montant décroissant</option>
          </select>
        </div>

        {/* ── Liste ── */}
        {!docs && <div className="loading-spinner"><div className="spinner" /></div>}
        {docs?.length === 0 && (
          <div className="card"><div className="card-body"><div className="empty-state">Aucun document trouvé.</div></div></div>
        )}

        {docs?.length > 0 && (
          <div className="card fade-in-up">
            <div className="vehicles-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Nom</th>
                    <th>Véhicule</th>
                    <th>Catégorie</th>
                    <th>Date doc.</th>
                    <th>Expiration</th>
                    <th>Montant</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(d => {
                    const expired = isExpired(d.expiration_date, d.status)
                    const expiring = isExpiring(d.expiration_date, d.status)
                    const v = vehicles?.find(x => x.id === d.vehicle_id)

                    return (
                      <tr key={d.id} className={expired ? 'row-danger' : expiring ? 'row-warning' : ''}>
                        <td style={{ fontSize: 20, textAlign: 'center' }}>
                          <a href={`${API_URL}${d.url}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                            {docIcon(d.type)}
                          </a>
                        </td>
                        <td>
                          <a href={`${API_URL}${d.url}`} target="_blank" rel="noreferrer" className="doc-link-main">
                            {d.name}
                          </a>
                          {d.description && <div className="doc-desc-sub">{d.description}</div>}
                        </td>
                        <td>
                          {v ? (
                            <Link href={`/app/vehicles/${v.id}`} className="doc-vehicle-link">
                              {v.registration || `${v.brand} ${v.model}`}
                            </Link>
                          ) : (
                            <span className="badge badge-reparation">Non classé</span>
                          )}
                        </td>
                        <td className="muted">{d.category || '—'}</td>
                        <td className="muted">{fmtDate(d.date)}</td>
                        <td>
                          {d.expiration_date ? (
                            <span style={{ color: expired ? 'var(--danger)' : expiring ? 'var(--warning-dark)' : 'inherit', fontWeight: (expired||expiring) ? 600 : 400 }}>
                              {fmtDate(d.expiration_date)}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ fontWeight: d.amount ? 600 : 400 }}>{fmtAmt(d.amount)}</td>
                        <td>
                          <span className={`badge badge-${d.status === 'valide' ? 'vendu' : d.status === 'expiré' ? 'reparation' : 'stock'}`}>
                            {d.status || 'valide'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn-icon danger" onClick={() => deleteDoc(d.id)} title="Supprimer">✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
