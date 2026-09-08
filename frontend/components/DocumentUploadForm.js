/**
 * DocumentUploadForm — formulaire d'ajout de document unique, partagé entre
 * la vue Documents globale et l'onglet Documents d'une fiche véhicule.
 * Si `vehicleId` est fourni, le document est rattaché directement ; sinon
 * un sélecteur de véhicule (optionnel) est affiché.
 */
import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export const DOC_CATS = ['Photo', 'Facture', 'Contrôle technique', 'Carte grise', 'Assurance', 'Devis', 'Contrat', 'Rapport', 'Autre']
export const DOC_STATUSES = ['valide', 'en attente', 'expiré', 'archivé']

// Présélectionne une catégorie plausible à partir du nom de fichier déposé.
function guessCategory(filename) {
  const n = filename.toLowerCase()
  if (n.includes('carte-grise') || n.includes('cartegrise') || n.includes('immat')) return 'Carte grise'
  if (n.includes('assurance')) return 'Assurance'
  if (n.includes('ct') || n.includes('controle-technique') || n.includes('controle_technique')) return 'Contrôle technique'
  if (n.includes('facture')) return 'Facture'
  if (n.includes('devis')) return 'Devis'
  if (n.includes('contrat')) return 'Contrat'
  if (/\.(jpe?g|png|webp|heic)$/i.test(n)) return 'Photo'
  return ''
}

export default function DocumentUploadForm({ apiUrl, vehicleId = null, vehicles, onUploaded }) {
  const [docForm, setDocForm] = useState({ vehicle_id: vehicleId ?? '', category: '', name: '', description: '', date: '', expiration_date: '', amount: '', status: 'valide' })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const set = (k, v) => setDocForm(p => ({ ...p, [k]: v }))

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = vehicleId ? `${vehicleId}/${fileName}` : `global/${fileName}`

      const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath)

      const payload = {
        vehicle_id: docForm.vehicle_id ? parseInt(docForm.vehicle_id) : null,
        category: docForm.category || guessCategory(file.name) || null,
        name: docForm.name || file.name,
        description: docForm.description || null,
        doc_date: docForm.date || null,
        expiration_date: docForm.expiration_date || null,
        amount: docForm.amount ? parseFloat(docForm.amount) : null,
        status: docForm.status || 'valide',
        url: publicUrl,
        type: file.type || 'application/octet-stream',
      }

      const res = await fetch(`${apiUrl}/documents/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const created = await res.json()
        onUploaded?.(created)
        setDocForm({ vehicle_id: vehicleId ?? '', category: '', name: '', description: '', date: '', expiration_date: '', amount: '', status: 'valide' })
      } else {
        onUploaded?.(null, "Erreur lors de l'ajout en base.")
      }
    } catch (err) {
      console.error(err)
      onUploaded?.(null, "Erreur lors de l'envoi du fichier.")
    }
    setUploading(false)
  }

  return (
    <div>
      <div className="form-grid-3" style={{ marginBottom: 16 }}>
        <div className="form-group span-3">
          <label className="form-label">Nom du document</label>
          <input className="form-input" placeholder="Laisser vide pour utiliser le nom du fichier" value={docForm.name} onChange={e => set('name', e.target.value)} />
        </div>
        {!vehicleId && (
          <div className="form-group">
            <label className="form-label">Véhicule lié</label>
            <select className="form-input" value={docForm.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
              <option value="">Aucun (document général)</option>
              {vehicles?.map(v => (
                <option key={v.id} value={v.id}>{v.registration || `${v.brand} ${v.model}`}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Catégorie</label>
          <select className="form-input" value={docForm.category} onChange={e => set('category', e.target.value)}>
            <option value="">— Sélectionner —</option>
            {DOC_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Statut</label>
          <select className="form-input" value={docForm.status} onChange={e => set('status', e.target.value)}>
            {DOC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Date du document</label>
          <input type="date" className="form-input" value={docForm.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Date d'expiration</label>
          <input type="date" className="form-input" value={docForm.expiration_date} onChange={e => set('expiration_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Montant éventuel (€)</label>
          <input type="number" step="0.01" min="0" className="form-input" placeholder="0.00" value={docForm.amount} onChange={e => set('amount', e.target.value)} />
        </div>
      </div>

      <div
        className={`upload-zone${uploading ? ' drag-over' : ''}`}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files[0]) }}
      >
        <input ref={fileRef} type="file" style={{ display: 'none' }}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp"
          onChange={e => handleUpload(e.target.files[0])} />
        {uploading ? (
          <div className="upload-zone-text">Envoi en cours...</div>
        ) : (
          <>
            <div className="upload-zone-text">Cliquez ou glissez un fichier ici</div>
            <div className="upload-zone-hint">PDF, Excel, Word, images (max 10&nbsp;MB) — la catégorie se présélectionne depuis le nom du fichier</div>
          </>
        )}
      </div>
    </div>
  )
}
