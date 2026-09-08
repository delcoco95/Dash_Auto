import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import Layout from '../../../components/Layout'
import FilePreviewModal from '../../../components/FilePreviewModal'
import DocumentUploadForm, { DOC_CATS, DOC_STATUSES } from '../../../components/DocumentUploadForm'
import { Plus, Trash2, X, FolderOpen } from 'lucide-react'
import { fmtDate, fmt } from '../../../lib/format'
import { isExpiring, isExpired, getDocIcon, docStatusBadgeClass } from '../../../lib/documents'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

export default function DocumentsGlobal() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [sort, setSort] = useState('created_desc')
  const [showModal, setShowModal] = useState(false)

  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (category) params.set('category', category)
  if (status) params.set('status', status)
  if (sort) params.set('sort', sort)
  if (vehicleFilter === 'unclassified') params.set('vehicle_id', '-1')
  else if (vehicleFilter) params.set('vehicle_id', vehicleFilter)

  const { data: docs, error, mutate } = useSWR(`${API_URL}/documents?${params}`, fetcher)
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)

  const deleteDoc = async (id) => {
    if (!confirm('Supprimer ce document définitivement ?')) return
    await fetch(`${API_URL}/documents/${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <Layout title="Tous les Documents">
      <div className="page-header">
        <div>
          <h1 className="page-title">Documents centralisés</h1>
          <p className="page-subtitle">Gérez toutes les factures, contrats et documents administratifs du parc.</p>
        </div>
        <div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Ajouter un document
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* ── Filtres ── */}
        <div className="search-filter-bar">
          <div className="search-input-wrapper">
            <input
              className="search-input"
              placeholder="Rechercher un document..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select className="filter-select" value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}>
            <option value="">Tous les véhicules</option>
            <option value="unclassified">Non classés (aucun véhicule)</option>
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
          <div className="card"><div className="card-body"><div className="empty-state">
            <FolderOpen size={24} color="var(--text-muted)" style={{ marginBottom: 12 }} />
            <div>Aucun document trouvé.</div>
          </div></div></div>
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
                    const Icon = getDocIcon(d.type)

                    return (
                      <tr key={d.id} className={expired ? 'row-danger' : expiring ? 'row-warning' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          <span onClick={() => setPreviewFile({ url: d.url.startsWith('http') ? d.url : `${API_URL}${d.url}`, name: d.name, type: d.type })} style={{ cursor: 'pointer', display: 'inline-flex' }}>
                            <Icon size={18} color="var(--accent-primary)" />
                          </span>
                        </td>
                        <td>
                          <span onClick={() => setPreviewFile({ url: d.url.startsWith('http') ? d.url : `${API_URL}${d.url}`, name: d.name, type: d.type })} className="doc-link-main" style={{ cursor: 'pointer' }}>
                            {d.name}
                          </span>
                          {d.description && <div className="doc-desc-sub">{d.description}</div>}
                        </td>
                        <td data-label="Véhicule">
                          {v ? (
                            <Link href={`/app/vehicles/${v.id}`} className="doc-vehicle-link">
                              {v.registration || `${v.brand} ${v.model}`}
                            </Link>
                          ) : (
                            <span className="badge badge-doc-attente">Non classé</span>
                          )}
                        </td>
                        <td className="muted" data-label="Catégorie">{d.category || '—'}</td>
                        <td className="muted" data-label="Date">{fmtDate(d.date)}</td>
                        <td data-label="Expiration">
                          {d.expiration_date ? (
                            <span style={{ color: expired ? 'var(--danger)' : expiring ? 'var(--warning-dark)' : 'inherit', fontWeight: (expired || expiring) ? 600 : 400 }}>
                              {fmtDate(d.expiration_date)}
                            </span>
                          ) : '—'}
                        </td>
                        <td data-label="Montant" style={{ fontWeight: d.amount ? 600 : 400 }}>{fmt(d.amount)}</td>
                        <td data-label="Statut">
                          <span className={`badge ${docStatusBadgeClass(d.status)}`}>{d.status || 'valide'}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn-icon danger" onClick={() => deleteDoc(d.id)} title="Supprimer"><Trash2 size={15} /></button>
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

      {/* ── Modal d'Ajout de Document ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '600px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Ajouter un document</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <DocumentUploadForm
              apiUrl={API_URL}
              vehicles={vehicles}
              onUploaded={(doc, errMsg) => {
                if (doc) { mutate(); setShowModal(false) } else if (errMsg) { alert(errMsg) }
              }}
            />
          </div>
        </div>
      )}

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </Layout>
  )
}
