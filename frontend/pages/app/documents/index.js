import { useState, useRef } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import Layout from '../../../components/Layout'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

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

  // Upload Modal State
  const [showModal, setShowModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [docForm, setDocForm] = useState({ vehicle_id: '', category: '', name: '', description: '', date: '', expiration_date: '', amount: '', status: 'valide' })
  const fileRef = useRef()

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
    if (!type) return ''
    if (type.startsWith('image/')) return '️'
    if (type.includes('pdf')) return ''
    if (type.includes('word') || type.includes('doc')) return ''
    if (type.includes('excel') || type.includes('sheet') || type.includes('xls')) return ''
    return ''
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

  const handleDocUpload = async (file) => {
    if (!file) return
    setUploading(true)
    
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `global/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath)

      const payload = {
        vehicle_id: docForm.vehicle_id ? parseInt(docForm.vehicle_id) : null,
        category: docForm.category || null,
        name: docForm.name || file.name,
        description: docForm.description || null,
        doc_date: docForm.date || null,
        expiration_date: docForm.expiration_date || null,
        amount: docForm.amount ? parseFloat(docForm.amount) : null,
        status: docForm.status || 'valide',
        url: publicUrl,
        type: file.type || "application/octet-stream"
      }

      const res = await fetch(`${API_URL}/documents/url`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload) 
      })

      if (res.ok) { 
        mutate()
        setShowModal(false)
        setDocForm({ vehicle_id: '', category: '', name: '', description: '', date: '', expiration_date: '', amount: '', status: 'valide' })
        alert('Document ajouté !')
      } else {
        alert('Erreur lors de l\'ajout en base.')
      }
    } catch (err) {
      console.error(err)
      alert('Erreur lors de l\'upload Supabase.')
    }
    
    setUploading(false)
  }

  return (
    <Layout title="Tous les Documents">
      <div className="page-header">
        <div>
          <h1 className="page-title"> Documents centralisés</h1>
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
            <span className="search-icon"></span>
            <input
              className="search-input"
              placeholder="Rechercher un document..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select className="filter-select" value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}>
            <option value="">Tous les véhicules</option>
            <option value="unclassified">️ Non classés (Aucun véhicule)</option>
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
                          <button className="btn-icon danger" onClick={() => deleteDoc(d.id)} title="Supprimer"></button>
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
        <div className="modal-overlay" onClick={() => !uploading && setShowModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '90%', maxWidth: '600px', borderRadius: '12px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Ajouter un document</h2>
              <button onClick={() => !uploading && setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div className="form-grid-2" style={{ marginBottom: 16 }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Nom du document</label>
                <input className="form-input" placeholder="Laisser vide pour utiliser le nom du fichier" value={docForm.name} onChange={e => setDocForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Véhicule lié</label>
                <select className="form-input" value={docForm.vehicle_id} onChange={e => setDocForm(p => ({ ...p, vehicle_id: e.target.value }))}>
                  <option value="">Aucun (Document général)</option>
                  {vehicles?.map(v => (
                    <option key={v.id} value={v.id}>{v.registration || `${v.brand} ${v.model}`}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select className="form-input" value={docForm.category} onChange={e => setDocForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="">— Sélectionner —</option>
                  {DOC_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date du document</label>
                <input type="date" className="form-input" value={docForm.date} onChange={e => setDocForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Date d'expiration</label>
                <input type="date" className="form-input" value={docForm.expiration_date} onChange={e => setDocForm(p => ({ ...p, expiration_date: e.target.value }))} />
              </div>
            </div>
            
            <div
              className={`upload-zone${uploading ? ' drag-over' : ''}`}
              onClick={() => !uploading && fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleDocUpload(e.dataTransfer.files[0]) }}
              style={{
                border: '2px dashed var(--border-strong)', borderRadius: 12, padding: 30, textAlign: 'center', cursor: 'pointer',
                background: uploading ? 'var(--bg-main)' : 'transparent', transition: 'all 0.2s', marginBottom: 20
              }}
            >
              <input type="file" style={{ display: 'none' }} ref={fileRef} onChange={e => handleDocUpload(e.target.files[0])} />
              {uploading ? (
                <div style={{ color: 'var(--accent)', fontWeight: 600 }}>Envoi vers Supabase...</div>
              ) : (
                <>
                  <div style={{ fontSize: 24, marginBottom: 8 }}></div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Cliquez ou glissez un fichier ici</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>PDF, Images, Word, Excel (max 10MB)</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
