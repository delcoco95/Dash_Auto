import { useState, useRef } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import Link from 'next/link'
import Layout from '../../../../components/Layout'
import FilePreviewModal from '../../../../components/FilePreviewModal'
import DocumentUploadForm from '../../../../components/DocumentUploadForm'
import InterventionForm, { INT_STATUSES } from '../../../../components/InterventionForm'
import { supabase } from '../../../../lib/supabase'
import { fmt, fmtKm, fmtDate } from '../../../../lib/format'
import { getDocIcon, docStatusBadgeClass } from '../../../../lib/documents'
import {
  Info, Image as ImageIcon, FileText, Wrench, Receipt, History,
  Car, Euro, Settings2, StickyNote, Pencil, Trash2, CheckCircle2,
  AlertCircle, AlertTriangle, Star, Plus,
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

const STATE_COLORS = { excellent: '#00d4aa', bon: '#6c63ff', correct: '#f5a623', mauvais: '#ff4d6d' }

function InfoItem({ label, value, color }) {
  return (
    <div className="info-item">
      <div className="info-label">{label}</div>
      <div className={`info-value${!value || value === '—' ? ' empty' : ''}`} style={color ? { color } : {}}>
        {value || '—'}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const s = (status || '').toLowerCase()
  const cls = s.includes('stock') ? 'badge-stock'
    : s.includes('vendu') ? 'badge-vendu'
    : s.includes('rép') || s.includes('rep') ? 'badge-reparation'
    : 'badge-vendu'
  return <span className={`badge ${cls}`}>{status}</span>
}

function InterventionBadge({ status }) {
  const s = (status || '').toLowerCase().replace(/\s+/g, '-').replace(/é/g, 'e').replace(/è/g, 'e').replace(/à/g, 'a')
  return <span className={`badge badge-${s}`}>{status}</span>
}

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {t.message}
        </div>
      ))}
    </div>
  )
}

function ConfirmModal({ title, text, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-text">{text}</div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
          <button className="btn btn-danger btn" onClick={onConfirm}>Confirmer</button>
        </div>
      </div>
    </div>
  )
}

const CHARGE_CATS = ['Achat', 'Réparation', 'Entretien', 'Assurance', 'Transport', 'Carburant', 'Taxe', 'Commission', 'Autre']

const TABS = [
  { id: 'info',          label: 'Informations',   icon: Info },
  { id: 'images',        label: 'Galerie',         icon: ImageIcon },
  { id: 'docs',          label: 'Documents',       icon: FileText },
  { id: 'interventions', label: 'Travaux',         icon: Wrench },
  { id: 'charges',       label: 'Charges',         icon: Receipt },
  { id: 'histo',         label: 'Historique',      icon: History },
]

export default function VehicleDetail() {
  const router = useRouter()
  const { id } = router.query
  const [tab, setTab] = useState('info')
  const [toasts, setToasts] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)

  // Data fetching
  const { data: vehicle, error: vErr, mutate: mutV } = useSWR(id ? `${API_URL}/vehicles/${id}` : null, fetcher)
  const { data: charges, mutate: mutC } = useSWR(id ? `${API_URL}/vehicles/${id}/charges` : null, fetcher)
  const { data: docs,    mutate: mutD } = useSWR(id ? `${API_URL}/vehicles/${id}/documents` : null, fetcher)
  const { data: interventions, mutate: mutI } = useSWR(id ? `${API_URL}/vehicles/${id}/interventions` : null, fetcher)
  const { data: images, mutate: mutImg } = useSWR(id ? `${API_URL}/vehicles/${id}/images` : null, fetcher)

  // Forms state
  const [chargeForm, setChargeForm] = useState({ category: '', amount: '', date: '', description: '' })
  const [showChargeForm, setShowChargeForm] = useState(false)
  const [showIntForm, setShowIntForm] = useState(false)

  const [uploading, setUploading] = useState(false)
  const imgRef = useRef()

  const toast = (message, type = 'success') => {
    const t = { id: Date.now(), message, type }
    setToasts(prev => [...prev, t])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500)
  }

  const deleteVehicle = async () => {
    const res = await fetch(`${API_URL}/vehicles/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/app/vehicles')
    else toast('Erreur lors de la suppression', 'error')
  }

  // ── Images ──
  const handleImageUpload = async (file) => {
    if (!file) return
    setUploading(true)
    
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${id}/${fileName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath)

      const payload = { url: publicUrl, description: '' }
      
      const res = await fetch(`${API_URL}/vehicles/${id}/images/url`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) { mutImg(); toast('Image ajoutée') }
      else toast('Erreur ajout DB', 'error')
    } catch (err) {
      console.error(err)
      toast('Erreur upload Supabase', 'error')
    }
    
    setUploading(false)
  }

  const deleteImage = async (imgId) => {
    const res = await fetch(`${API_URL}/images/${imgId}`, { method: 'DELETE' })
    if (res.ok) { mutImg(); toast('Image supprimée') }
    else toast('Erreur suppression', 'error')
  }

  const setMainImage = async (imgId) => {
    const res = await fetch(`${API_URL}/images/${imgId}/main?vehicle_id=${id}`, { method: 'PUT' })
    if (res.ok) { mutImg(); toast('Image principale définie') }
  }

  // ── Documents ──
  const deleteDoc = async (did) => {
    const res = await fetch(`${API_URL}/documents/${did}`, { method: 'DELETE' })
    if (res.ok) { mutD(); toast('Document supprimé') }
    else toast('Erreur suppression', 'error')
  }

  // ── Charges ──
  const addCharge = async (e) => {
    e.preventDefault()
    if (!chargeForm.category || !chargeForm.amount) return
    const res = await fetch(`${API_URL}/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...chargeForm, vehicle_id: parseInt(id), amount: parseFloat(chargeForm.amount) }),
    })
    if (res.ok) {
      mutC(); setChargeForm({ category: '', amount: '', date: '', description: '' })
      setShowChargeForm(false); toast('Charge ajoutée')
    } else toast('Erreur ajout charge', 'error')
  }

  const deleteCharge = async (cid) => {
    const res = await fetch(`${API_URL}/charges/${cid}`, { method: 'DELETE' })
    if (res.ok) { mutC(); toast('Charge supprimée') }
  }

  // ── Interventions ──
  const addIntervention = async (payload) => {
    const res = await fetch(`${API_URL}/interventions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, vehicle_id: parseInt(id) }),
    })
    if (res.ok) {
      mutI()
      setShowIntForm(false); toast('Intervention ajoutée')
    } else toast('Erreur', 'error')
  }

  const updateIntStatus = async (iid, newStatus) => {
    await fetch(`${API_URL}/interventions/${iid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    mutI()
  }

  const deleteIntervention = async (iid) => {
    const res = await fetch(`${API_URL}/interventions/${iid}`, { method: 'DELETE' })
    if (res.ok) { mutI(); toast('Intervention supprimée') }
  }

  if (vErr) return (
    <Layout title="Véhicule">
      <div className="page-header"><h1 className="page-title">Véhicule non trouvé</h1></div>
      <div className="page-body">
        <div className="card"><div className="card-body">
          <div className="empty-state"><AlertTriangle size={20} color="var(--warning)" style={{ marginBottom: 8 }} /><br />Véhicule introuvable.<br />
            <Link href="/app/vehicles" style={{ color: 'var(--accent)', marginTop: 12, display: 'inline-block' }}>← Retour à la liste</Link>
          </div>
        </div></div>
      </div>
    </Layout>
  )

  if (!vehicle) return (
    <Layout title="Véhicule">
      <div className="page-header"><h1 className="page-title">Chargement...</h1></div>
      <div className="page-body"><div className="loading-spinner"><div className="spinner" /> Chargement...</div></div>
    </Layout>
  )

  const title = `${vehicle.brand} ${vehicle.model}${vehicle.version ? ` ${vehicle.version}` : ''}`
  const totalCharges = (charges || []).reduce((s, c) => s + c.amount, 0)
  const profit = vehicle.price_sell != null && vehicle.price_buy != null
    ? vehicle.price_sell - vehicle.price_buy - totalCharges : null

  const customFields = (() => {
    try { return Object.entries(JSON.parse(vehicle.custom_fields || '{}')) } catch { return [] }
  })()

  const histovecUrl = vehicle.registration 
    ? `https://histovec.interieur.gouv.fr/histovec/accueil?immatriculation=${vehicle.registration}`
    : `https://histovec.interieur.gouv.fr/histovec/accueil`

  return (
    <Layout title={title}>
      <Toast toasts={toasts} />
      {confirmDelete && (
        <ConfirmModal
          title="Supprimer ce véhicule ?"
          text={`Vous allez supprimer définitivement ${title} ainsi que toutes ses charges, documents et interventions. Cette action est irréversible.`}
          onConfirm={deleteVehicle}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {/* ── Header ── */}
      <div className="page-header">
        <div className="detail-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Link href="/app/vehicles" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Véhicules</Link>
            </div>
            <h1 className="detail-title">{title}</h1>
            <div className="detail-subtitle" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              {vehicle.registration && <span className="vehicle-reg">{vehicle.registration}</span>}
              {vehicle.year && <span>{vehicle.year}</span>}
              {vehicle.fuel && <span>{vehicle.fuel}</span>}
              <StatusBadge status={vehicle.status} />
              {profit !== null && (
                <span style={{ fontWeight: 700, color: profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {profit >= 0 ? '+' : ''}{fmt(profit)} net
                </span>
              )}
            </div>
          </div>
          <div className="detail-actions">
            <Link href={`/app/vehicles/${id}/edit`} className="btn btn-ghost">
              <Pencil size={15} /> Modifier
            </Link>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} /> Supprimer
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* ── Tabs ── */}
        <div className="tab-bar">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={15} />
              {t.label}
              {t.id === 'images'  && images?.length  ? ` (${images.length})`  : ''}
              {t.id === 'charges' && charges?.length ? ` (${charges.length})` : ''}
              {t.id === 'docs'    && docs?.length    ? ` (${docs.length})`    : ''}
              {t.id === 'interventions' && interventions?.length ? ` (${interventions.length})` : ''}
            </button>
          ))}
        </div>

        {/* ══════════ ONGLET INFORMATIONS ══════════ */}
        {tab === 'info' && (
          <>
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-header"><span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Car size={18} /> Identité</span></div>
              <div className="card-body">
                <div className="info-grid">
                  <InfoItem label="Marque"         value={vehicle.brand} />
                  <InfoItem label="Modèle"         value={vehicle.model} />
                  <InfoItem label="Version"        value={vehicle.version} />
                  <InfoItem label="Immatriculation" value={vehicle.registration} />
                  <InfoItem label="Année"          value={vehicle.year} />
                  <InfoItem label="VIN"            value={vehicle.vin} />
                  <InfoItem label="Type"           value={vehicle.type} />
                  <InfoItem label="Énergie"        value={vehicle.fuel} />
                  <InfoItem label="Boîte"          value={vehicle.gearbox} />
                  <InfoItem label="Couleur"        value={vehicle.color} />
                  <InfoItem label="Portes"         value={vehicle.doors} />
                  <InfoItem label="Places"         value={vehicle.seats} />
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-header"><span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Euro size={18} /> Financier</span></div>
              <div className="card-body">
                <div className="info-grid">
                  <InfoItem label="Kilométrage"     value={fmtKm(vehicle.km)} />
                  <InfoItem label="Date d'achat"    value={fmtDate(vehicle.date_buy)} />
                  <InfoItem label="Prix d'achat"    value={fmt(vehicle.price_buy)} />
                  <InfoItem label="Date de vente"   value={fmtDate(vehicle.date_sell)} />
                  <InfoItem label="Prix de vente"   value={fmt(vehicle.price_sell)} />
                  <InfoItem label="Valeur estimée"  value={fmt(vehicle.estimated_value)} />
                  <InfoItem label="Total charges"   value={fmt(totalCharges)} color="var(--danger)" />
                  {profit !== null && (
                    <InfoItem label="Profit net"    value={fmt(profit)} color={profit >= 0 ? 'var(--success)' : 'var(--danger)'} />
                  )}
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-header"><span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings2 size={18} /> Technique</span></div>
              <div className="card-body">
                <div className="info-grid">
                  <InfoItem label="Dernier entretien"  value={fmtDate(vehicle.date_last_service)} />
                  <InfoItem label="Prochain entretien" value={fmtDate(vehicle.date_next_service)} />
                  <InfoItem label="Dernier CT"         value={fmtDate(vehicle.date_last_ct)} />
                  <InfoItem label="Prochain CT"        value={fmtDate(vehicle.date_next_ct)} />
                  <InfoItem label="Moteur"    value={vehicle.engine_state}   color={STATE_COLORS[vehicle.engine_state]} />
                  <InfoItem label="Carrosserie" value={vehicle.body_state}   color={STATE_COLORS[vehicle.body_state]} />
                  <InfoItem label="Pneus"     value={vehicle.tire_state}    color={STATE_COLORS[vehicle.tire_state]} />
                  <InfoItem label="Intérieur" value={vehicle.interior_state} color={STATE_COLORS[vehicle.interior_state]} />
                </div>
              </div>
            </div>

            {(vehicle.notes || vehicle.internal_notes || customFields.length > 0) && (
              <div className="card">
                <div className="card-header"><span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><StickyNote size={18} /> Notes</span></div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {vehicle.notes && (
                    <div>
                      <div className="info-label" style={{ marginBottom: 6 }}>Notes générales</div>
                      <p style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{vehicle.notes}</p>
                    </div>
                  )}
                  {vehicle.internal_notes && (
                    <div>
                      <div className="info-label" style={{ marginBottom: 6 }}>Notes internes</div>
                      <p style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{vehicle.internal_notes}</p>
                    </div>
                  )}
                  {customFields.length > 0 && (
                    <div>
                      <div className="info-label" style={{ marginBottom: 8 }}>Champs personnalisés</div>
                      <div className="info-grid">
                        {customFields.map(([k, v]) => <InfoItem key={k} label={k} value={v} />)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════ ONGLET IMAGES ══════════ */}
        {tab === 'images' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ImageIcon size={18} /> Galerie Photos ({images?.length ?? 0})</span>
              <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => !uploading && imgRef.current?.click()}>
                <Plus size={14} /> {uploading ? 'Envoi...' : 'Ajouter une image'}
              </button>
              <input ref={imgRef} type="file" style={{ display: 'none' }}
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={e => handleImageUpload(e.target.files[0])} />
            </div>
            <div className="card-body">
              {!images && <div className="loading-spinner"><div className="spinner" /></div>}
              {images?.length === 0 && <div className="empty-state">Aucune image. Ajoutez des photos du véhicule !</div>}
              
              {images?.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                  {images.map(img => (
                    <div key={img.id} style={{
                      position: 'relative', borderRadius: '8px', overflow: 'hidden',
                      border: img.is_main ? '2px solid var(--primary)' : '1px solid var(--border)',
                      boxShadow: img.is_main ? '0 0 10px rgba(108,99,255,0.3)' : 'none'
                    }}>
                      <span onClick={() => setPreviewFile({ url: img.url.startsWith('http') ? img.url : `${API_URL}${img.url}`, name: `Image ${img.id}`, type: 'image/jpeg' })} style={{ cursor: 'pointer' }}>
                        <img src={img.url.startsWith('http') ? img.url : `${API_URL}${img.url}`} style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }} />
                      </span>
                      
                      {img.is_main && (
                        <div style={{ position: 'absolute', top: 8, left: 8, background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: 11, fontWeight: 700 }}>
                          PRINCIPALE
                        </div>
                      )}
                      
                      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                        {!img.is_main && (
                          <button onClick={() => setMainImage(img.id)} title="Définir comme image principale"
                            style={{ background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                            <Star size={14} />
                          </button>
                        )}
                        <button onClick={() => deleteImage(img.id)} title="Supprimer"
                          style={{ background: 'rgba(255,77,109,0.8)', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', display: 'flex' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ ONGLET CHARGES ══════════ */}
        {tab === 'charges' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Receipt size={18} /> Charges ({charges?.length ?? 0})</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {charges?.length > 0 && (
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)' }}>
                    Total : {fmt(totalCharges)}
                  </span>
                )}
                <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }}
                  onClick={() => setShowChargeForm(s => !s)}>
                  <Plus size={14} /> Ajouter
                </button>
              </div>
            </div>
            <div className="card-body">
              {showChargeForm && (
                <form className="inline-form" onSubmit={addCharge}>
                  <div className="inline-form-title">Nouvelle charge</div>
                  <div className="inline-form-row">
                    <div className="form-group">
                      <label className="form-label required">Catégorie</label>
                      <select className="form-input" value={chargeForm.category} onChange={e => setChargeForm(p => ({ ...p, category: e.target.value }))} required>
                        <option value="">— Catégorie —</option>
                        {CHARGE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Montant (€)</label>
                      <input className="form-input" type="number" step="0.01" min="0" value={chargeForm.amount} onChange={e => setChargeForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date</label>
                      <input className="form-input" type="date" value={chargeForm.date} onChange={e => setChargeForm(p => ({ ...p, date: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">Description</label>
                      <input className="form-input" value={chargeForm.description} onChange={e => setChargeForm(p => ({ ...p, description: e.target.value }))} placeholder="Détail..." />
                    </div>
                    <div style={{ display: 'flex', gap: 8, paddingTop: 22 }}>
                      <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>Ajouter</button>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowChargeForm(false)}>Annuler</button>
                    </div>
                  </div>
                </form>
              )}

              {!charges && <div className="loading-spinner"><div className="spinner" /></div>}
              {charges?.length === 0 && !showChargeForm && (
                <div className="empty-state">Aucune charge enregistrée.</div>
              )}
              {charges?.length > 0 && (
                <div className="charge-list">
                  {charges.map(c => (
                    <div className="charge-item" key={c.id}>
                      <span className="charge-cat-badge">{c.category}</span>
                      <span className="charge-desc">{c.description || '—'}</span>
                      <span className="charge-date">{fmtDate(c.date)}</span>
                      <span className="charge-amount">- {fmt(c.amount)}</span>
                      <button className="btn-icon danger" title="Supprimer" onClick={() => deleteCharge(c.id)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ ONGLET DOCUMENTS ══════════ */}
        {tab === 'docs' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={18} /> Documents Administratifs ({docs?.length ?? 0})</span>
            </div>
            <div className="card-body">
              {/* Formulaire d'ajout — composant partagé avec la vue Documents globale */}
              <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: 12, marginBottom: 24, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Ajouter un document</div>
                <DocumentUploadForm
                  apiUrl={API_URL}
                  vehicleId={parseInt(id)}
                  onUploaded={(doc, errMsg) => {
                    if (doc) { mutD(); toast('Document ajouté') } else if (errMsg) { toast(errMsg, 'error') }
                  }}
                />
              </div>

              {/* Documents grid */}
              {!docs && <div className="loading-spinner"><div className="spinner" /></div>}
              {docs?.length === 0 && <div className="empty-state">Aucun document attaché.</div>}
              {docs?.length > 0 && (
                <div className="doc-grid">
                  {docs.map(d => {
                    const DocIcon = getDocIcon(d.type)
                    return (
                      <div className="doc-item" key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span onClick={() => setPreviewFile({ url: d.url.startsWith('http') ? d.url : `${API_URL}${d.url}`, name: d.name, type: d.type })} style={{ cursor: 'pointer' }}>
                          <div className="doc-icon-preview" style={{ height: 60, width: 60 }}><DocIcon size={22} /></div>
                        </span>
                        <div className="doc-info" style={{ flex: 1 }}>
                          <div className="doc-name" title={d.name}>{d.name}</div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            {d.category && <span className="badge badge-doc-attente" style={{ fontSize: 10 }}>{d.category}</span>}
                            <span className={`badge ${docStatusBadgeClass(d.status)}`} style={{ fontSize: 10 }}>{d.status || 'valide'}</span>
                            {d.expiration_date && <span style={{ fontSize: 11, color: 'var(--danger)' }}>Exp: {fmtDate(d.expiration_date)}</span>}
                          </div>
                        </div>
                        <button className="doc-delete" title="Supprimer" onClick={() => deleteDoc(d.id)}><Trash2 size={16} /></button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ ONGLET TRAVAUX ══════════ */}
        {tab === 'interventions' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wrench size={18} /> Travaux & Interventions ({interventions?.length ?? 0})</span>
              <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => setShowIntForm(s => !s)}>
                <Plus size={14} /> Ajouter
              </button>
            </div>
            <div className="card-body">
              {showIntForm && (
                <div style={{ marginBottom: 20 }}>
                  <InterventionForm
                    onSubmit={addIntervention}
                    onCancel={() => setShowIntForm(false)}
                    submitLabel="Ajouter"
                  />
                </div>
              )}

              {!interventions && <div className="loading-spinner"><div className="spinner" /></div>}
              {interventions?.length === 0 && !showIntForm && (
                <div className="empty-state">Aucun travail planifié ou réalisé.</div>
              )}
              {interventions?.length > 0 && (
                <div className="intervention-list">
                  {interventions.map(i => (
                    <div className="intervention-item" key={i.id}>
                      <div className={`intervention-priority priority-${i.priority}`} />
                      <div className="intervention-content">
                        <div className="intervention-title">{i.title}</div>
                        <div className="intervention-meta">
                          {i.category && <span>{i.category}</span>}
                          {i.date_planned && <span>Prévu le {fmtDate(i.date_planned)}</span>}
                          {i.cost_estimated != null && <span>Estimé : {fmt(i.cost_estimated)}</span>}
                          {i.cost_actual != null && <span>Réel : {fmt(i.cost_actual)}</span>}
                        </div>
                        {i.description && (
                          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>{i.description}</p>
                        )}
                      </div>
                      <div className="intervention-actions">
                        <InterventionBadge status={i.status} />
                        <select
                          className="form-input"
                          style={{ fontSize: 12, padding: '3px 8px', width: 'auto' }}
                          value={i.status}
                          onChange={e => updateIntStatus(i.id, e.target.value)}
                          title="Changer le statut"
                        >
                          {INT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button className="btn-icon danger" title="Supprimer" onClick={() => deleteIntervention(i.id)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ ONGLET HISTORIQUE ══════════ */}
        {tab === 'histo' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><History size={18} /> Historique & Origine</span>
            </div>
            <div className="card-body">
              <div style={{ background: 'var(--surface-light)', padding: 24, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <History size={18} /> Service HistoVec
                </h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  Le service public HistoVec permet de consulter l'historique complet d'un véhicule immatriculé en France (nombre de propriétaires, sinistres, alertes, kilométrage CT).
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <a href={histovecUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                    Ouvrir HistoVec {vehicle.registration ? `pour ${vehicle.registration}` : ''} ↗
                  </a>
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Astuce : importez le rapport PDF généré par HistoVec dans l'onglet <strong>Documents</strong> afin de le conserver avec le reste du dossier du véhicule.
                </p>
              </div>

              <div style={{ marginTop: 24 }}>
                <div className="info-label" style={{ marginBottom: 12 }}>Résumé manuel de l'historique</div>
                <textarea 
                  className="form-input" 
                  rows={6}
                  placeholder="Notez ici les informations clés de l'historique (ex: 2ème main, import Allemagne, aucun sinistre...)"
                  defaultValue={vehicle.notes || ''}
                  readOnly
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  * Pour modifier le résumé, utilisez l'onglet Informations (Notes générales) ou la page de modification du véhicule.
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </Layout>
  )
}
