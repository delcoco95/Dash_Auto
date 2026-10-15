/**
 * SaleModal — enregistre la vente d'un véhicule :
 * prix, acheteur, mode de paiement → génère la facture « TVA sur marge » (PDF),
 * la range dans les documents et dans les justificatifs, puis propose de déposer
 * le certificat de cession signé et la preuve de paiement.
 */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { apiJSON, uploadDocument, setChecklist } from '../lib/upload'
import { buildMarginSaleInvoicePDF } from '../lib/pdfGenerator'
import { eur } from '../lib/fiscal'
import { X, CheckCircle2, ExternalLink, FileText, Download } from 'lucide-react'

const PAYMENTS = ['Virement', 'Chèque', 'Espèces', 'Carte', 'Financement']
const num = (x) => { const n = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

export default function SaleModal({ vehicle, onClose, onDone }) {
  const [f, setF] = useState({
    date_sell: vehicle.date_sell || new Date().toISOString().slice(0, 10), price_sell: vehicle.price_sell ?? vehicle.estimated_value ?? '',
    buyer_type: 'particulier', buyer_name: '', buyer_address: '', buyer_siret: '', payment_method: 'Virement', payment_ref: '', km_sale: vehicle.km || '',
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)        // { sale, pdfUrl }
  const [busy, setBusy] = useState({})
  const cessionRef = useRef(); const payRef = useRef()
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    apiJSON(`/fiscal/sales/${vehicle.id}`).then(s => {
      if (s) setF(p => ({ ...p, buyer_type: s.buyer_type || p.buyer_type, buyer_name: s.buyer_name || '', buyer_address: s.buyer_address || '', buyer_siret: s.buyer_siret || '', payment_method: s.payment_method || p.payment_method, payment_ref: s.payment_ref || '', km_sale: s.km_sale || p.km_sale }))
    }).catch(() => {})
  }, [vehicle.id])

  const submit = async (e) => {
    e.preventDefault()
    if (!f.date_sell || !num(f.price_sell)) return toast.error('Date et prix de vente obligatoires')
    setSaving(true)
    try {
      const sale = await apiJSON(`/fiscal/sales/${vehicle.id}`, 'POST', { ...f, price_sell: num(f.price_sell), km_sale: f.km_sale ? parseInt(f.km_sale) : null })
      const settings = await apiJSON('/fiscal/settings')
      const pdf = buildMarginSaleInvoicePDF({
        company: { name: settings.company_name, address: settings.company_address, phone: settings.company_phone, email: settings.company_email, siret: settings.company_siret },
        invoiceNumber: sale.invoice_number, invoiceDate: f.date_sell,
        buyer: { name: f.buyer_name, address: f.buyer_address, siret: f.buyer_type === 'professionnel' ? f.buyer_siret : null },
        vehicle, price: num(f.price_sell), paymentMethod: f.payment_method, paymentRef: f.payment_ref, km: f.km_sale,
      })
      const blob = pdf.output('blob')
      const file = new File([blob], `Facture ${sale.invoice_number} - ${vehicle.registration || vehicle.model}.pdf`, { type: 'application/pdf' })
      const doc = await uploadDocument({ file, vehicleId: vehicle.id, category: 'DV - Vente', name: `Facture de vente ${sale.invoice_number}`, date: f.date_sell, amount: num(f.price_sell) })
      await setChecklist(`sale_invoice:${vehicle.id}`, { document_id: doc.id, status: 'classé' })
      setDone({ sale, pdfUrl: URL.createObjectURL(blob), fileName: file.name })
      onDone?.()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const attach = async (key, file, label, category) => {
    if (!file) return
    setBusy(b => ({ ...b, [key]: true }))
    try {
      const doc = await uploadDocument({ file, vehicleId: vehicle.id, category, name: `${label} — ${vehicle.registration || vehicle.model}`, date: f.date_sell })
      await setChecklist(`${key}:${vehicle.id}`, { document_id: doc.id, status: 'classé' })
      toast.success(`${label} classé`)
      setBusy(b => ({ ...b, [key]: 'ok' }))
    } catch (err) { toast.error(err.message); setBusy(b => ({ ...b, [key]: false })) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '94%', maxWidth: 620, padding: 24, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{done ? 'Vente enregistrée' : 'Vendre le véhicule'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Fermer"><X size={20} /></button>
        </div>

        {!done && (
          <form onSubmit={submit}>
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label required">Date de vente</label><input type="date" className="form-input" value={f.date_sell} onChange={e => set('date_sell', e.target.value)} /></div>
              <div className="form-group"><label className="form-label required">Prix de vente (€)</label><input className="form-input" inputMode="decimal" value={f.price_sell} onChange={e => set('price_sell', e.target.value)} />
                <span className="form-hint">Le montant exact reçu de l'acheteur.</span></div>
            </div>
            <div className="form-group">
              <label className="form-label">Acheteur</label>
              <div className="segmented" style={{ marginBottom: 8 }}>
                {['particulier', 'professionnel'].map(t => <button type="button" key={t} className={`segmented-btn${f.buyer_type === t ? ' active' : ''}`} onClick={() => set('buyer_type', t)}>{t === 'particulier' ? 'Particulier' : 'Professionnel'}</button>)}
              </div>
              <div className="form-grid-2">
                <input className="form-input" placeholder="Nom et prénom / raison sociale" value={f.buyer_name} onChange={e => set('buyer_name', e.target.value)} />
                {f.buyer_type === 'professionnel' ? <input className="form-input" placeholder="SIRET" value={f.buyer_siret} onChange={e => set('buyer_siret', e.target.value)} /> : <input className="form-input" placeholder="Kilométrage à la vente" inputMode="numeric" value={f.km_sale} onChange={e => set('km_sale', e.target.value.replace(/\D/g, ''))} />}
              </div>
              <textarea className="form-textarea" style={{ minHeight: 60, marginTop: 8 }} placeholder="Adresse" value={f.buyer_address} onChange={e => set('buyer_address', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Paiement</label>
              <div className="segmented" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
                {PAYMENTS.map(p => <button type="button" key={p} className={`segmented-btn${f.payment_method === p ? ' active' : ''}`} onClick={() => set('payment_method', p)}>{p}</button>)}
              </div>
              <input className="form-input" placeholder="Référence (n° de virement, de chèque…)" value={f.payment_ref} onChange={e => set('payment_ref', e.target.value)} />
              {f.payment_method === 'Espèces' && num(f.price_sell) > 1000 && <span className="form-error">Paiement en espèces limité à 1 000 € pour un acheteur résidant en France : utilisez un virement ou un chèque au-delà.</span>}
            </div>
            <div className="wizard-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer et générer la facture'}</button>
            </div>
          </form>
        )}

        {done && (
          <>
            <div className="summary-box" style={{ marginBottom: 16 }}>
              <div className="row"><span>Facture</span><b>{done.sale.invoice_number}</b></div>
              <div className="row"><span>Prix de vente</span><span>{eur(done.sale.price_sell, 2)}</span></div>
              <div className="row"><span>Prix d'achat retenu{done.sale.purchase_estimated ? ' (estimé)' : ''}</span><span>{eur(done.sale.purchase_base, 2)}</span></div>
              <div className="row"><span>Marge TTC</span><span>{eur(done.sale.margin_ttc, 2)}</span></div>
              <div className="row"><span>TVA sur marge à déclarer</span><b>{eur(done.sale.vat_margin, 2)}</b></div>
            </div>
            <a className="btn btn-outline" href={done.pdfUrl} download={done.fileName} style={{ marginBottom: 16 }}><Download size={15} /> Télécharger la facture</a>
            <div className="section-title" style={{ fontSize: 15, marginTop: 8 }}>À faire maintenant</div>
            <div className="check-item" style={{ padding: '10px 0' }}>
              <div>
                <div className="check-item-title">Certificat de cession signé (cerfa 15776)</div>
                <div className="check-item-meta"><a className="doc-link-main" href="https://www.service-public.fr/particuliers/vosdroits/R20300" target="_blank" rel="noreferrer">Télécharger le formulaire <ExternalLink size={11} /></a> · à déclarer aussi sur le site de l'ANTS sous 15 jours</div>
              </div>
              <div className="check-item-actions">
                <input ref={cessionRef} type="file" accept="application/pdf,image/*" hidden onChange={e => attach('sale_cession', e.target.files?.[0], 'Certificat de cession', 'DV - Vente')} />
                {busy.sale_cession === 'ok' ? <CheckCircle2 size={18} color="var(--success)" /> : <button className="file-btn" onClick={() => cessionRef.current?.click()} disabled={busy.sale_cession}><FileText size={13} /> Déposer</button>}
              </div>
            </div>
            <div className="check-item" style={{ padding: '10px 0' }}>
              <div>
                <div className="check-item-title">Preuve du paiement de {eur(done.sale.price_sell, 0)}</div>
                <div className="check-item-meta">Capture du virement reçu, copie du chèque ou reçu signé</div>
              </div>
              <div className="check-item-actions">
                <input ref={payRef} type="file" accept="application/pdf,image/*" hidden onChange={e => attach('sale_payment', e.target.files?.[0], 'Preuve de paiement', 'Autre')} />
                {busy.sale_payment === 'ok' ? <CheckCircle2 size={18} color="var(--success)" /> : <button className="file-btn" onClick={() => payRef.current?.click()} disabled={busy.sale_payment}><FileText size={13} /> Déposer</button>}
              </div>
            </div>
            <div className="wizard-actions"><span /><button className="btn btn-primary" onClick={onClose}>Terminer</button></div>
          </>
        )}
      </div>
    </div>
  )
}
