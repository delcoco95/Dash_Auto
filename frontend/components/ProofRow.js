// Une ligne de justificatif : dépôt du fichier, ou « pas de facture » (main-d'œuvre d'un particulier…).
import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { uploadDocument } from '../lib/upload'
import { setProof, PROOF_KIND, DOC_CATEGORY } from '../lib/admin'
import { fmt, fmtDate } from '../lib/format'
import { Upload, Paperclip, CheckCircle2, AlertTriangle, Ban, Undo2 } from 'lucide-react'

export default function ProofRow({ it, onChanged, onPreview, hideVehicle }) {
  const fileRef = useRef()
  const [busy, setBusy] = useState(false)

  const attach = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const doc = await uploadDocument({
        file, vehicleId: it.vehicle_id, category: DOC_CATEGORY[it.kind] || 'Autre',
        name: `${PROOF_KIND[it.kind]} — ${it.label}${it.registration ? ` — ${it.registration}` : ''}`,
        date: it.date || null, amount: it.amount || null,
      })
      await setProof(it.key, { document_id: doc.id })
      toast.success('Justificatif ajouté')
      onChanged()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const mark = async (status) => {
    try { await setProof(it.key, { status }); onChanged() } catch (e) { toast.error(e.message) }
  }

  const Icon = it.status === 'manquant' ? AlertTriangle : it.status === 'ok' ? CheckCircle2 : Ban
  const color = it.status === 'manquant' ? 'var(--danger)' : it.status === 'ok' ? 'var(--success)' : 'var(--text-muted)'

  return (
    <div className="check-item">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
        <Icon size={18} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div className="check-item-title">{PROOF_KIND[it.kind]} · {it.label}</div>
          <div className="check-item-meta">
            {!hideVehicle && it.vehicle_id && <Link className="doc-vehicle-link" href={`/app/vehicles/${it.vehicle_id}`}>{it.vehicle}</Link>}
            {it.amount ? <span>{fmt(it.amount)}</span> : null}
            {it.date && <span>{fmtDate(it.date)}</span>}
            {it.document && <span className="doc-link-main" style={{ cursor: 'pointer' }} onClick={() => onPreview?.({ url: it.document.url, name: it.document.name, type: it.document.type })}><Paperclip size={11} /> {it.document.name}</span>}
            {it.status === 'non applicable' && <span>Pas de facture</span>}
          </div>
        </div>
      </div>
      <div className="check-item-actions">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={e => attach(e.target.files?.[0])} />
        {it.status === 'manquant' && (
          <>
            <button className="file-btn" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Envoi…' : <><Upload size={13} /> Ajouter la facture</>}</button>
            <button className="file-btn ghost" onClick={() => mark('non applicable')} title="Aucune facture n'existe (ex. main-d'œuvre d'un particulier)">Pas de facture</button>
          </>
        )}
        {it.status !== 'manquant' && !it.auto && (
          <button className="file-btn ghost" onClick={() => mark('manquant')} title="Annuler"><Undo2 size={13} /></button>
        )}
      </div>
    </div>
  )
}
