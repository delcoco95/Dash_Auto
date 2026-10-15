/**
 * PurchaseWizard — ajout d'un véhicule en 3 étapes :
 *   1. Le véhicule (immatriculation, marque, modèle… le reste est replié)
 *   2. L'achat (provenance, prix de la voiture seule, frais Auto1, transport)
 *   3. Photos et factures (facultatif) — classées automatiquement dans les justificatifs
 * Un seul appel crée le véhicule ET les pièces fiscales (régime de la marge / autoliquidation).
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { API_URL } from '../lib/api'
import { eur } from '../lib/fiscal'
import { uploadDocument, setChecklist, apiJSON } from '../lib/upload'
import { Camera, FileText, ChevronDown, ChevronRight, X } from 'lucide-react'

const FUELS = ['Essence', 'Diesel', 'Électrique', 'Hybride', 'Hybride rechargeable', 'GPL', 'Autre']
const GEARBOXES = ['Manuelle', 'Automatique']
const TYPES = ['Berline', 'Citadine', 'SUV / 4x4', 'Break', 'Monospace', 'Coupé', 'Cabriolet', 'Utilitaire', 'Autre']

function formatRegistration(raw) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/^[A-Z]{2}\d/.test(clean)) return [clean.slice(0, 2), clean.slice(2, 5), clean.slice(5, 7)].filter(Boolean).join('-')
  return raw.toUpperCase()
}
const num = (x) => { const n = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

function F({ label, required, hint, children }) {
  return (
    <div className="form-group">
      <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  )
}

function FileSlot({ label, hint, file, onChange, accept = 'application/pdf,image/*' }) {
  const ref = useRef()
  return (
    <div className="check-item" style={{ padding: '10px 0' }}>
      <div>
        <div className="check-item-title">{label}</div>
        <div className="check-item-meta">{file ? file.name : hint}</div>
      </div>
      <div className="check-item-actions">
        <input ref={ref} type="file" accept={accept} hidden onChange={e => onChange(e.target.files?.[0] || null)} />
        {file && <button type="button" className="btn-icon" onClick={() => onChange(null)} title="Retirer"><X size={14} /></button>}
        <button type="button" className={`file-btn${file ? ' ghost' : ''}`} onClick={() => ref.current?.click()}><FileText size={13} /> {file ? 'Changer' : 'Ajouter'}</button>
      </div>
    </div>
  )
}

export default function PurchaseWizard({ onSwitchToFull }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [more, setMore] = useState(false)
  const [dup, setDup] = useState(null)
  const [v, setV] = useState({ registration: '', brand: '', model: '', version: '', year: '', fuel: '', gearbox: '', km: '', vin: '', color: '', type: '', doors: '', seats: '', estimated_value: '' })
  const [a, setA] = useState({ supplier_type: 'auto1', supplier_name: '', date_buy: new Date().toISOString().slice(0, 10), car_price: '', car_invoice_ref: '', fees_ht: '', fees_ref: '', transport_ht: '', transport_ref: '', has_vat: false, pro_vat: '' })
  const [files, setFiles] = useState({ car: null, fees: null, transport: null, photos: [] })
  const photoRef = useRef()
  const debounce = useRef()
  const setVF = (k, val) => setV(p => ({ ...p, [k]: val }))
  const setAF = (k, val) => setA(p => ({ ...p, [k]: val }))

  // Doublon d'immatriculation
  useEffect(() => {
    const reg = v.registration.trim()
    setDup(null)
    if (reg.length < 6) return
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      try {
        const list = await apiJSON(`/vehicles?search=${encodeURIComponent(reg)}`)
        const m = Array.isArray(list) && list.find(x => (x.registration || '').toUpperCase() === reg.toUpperCase())
        if (m) setDup(m)
      } catch { /* silencieux */ }
    }, 400)
  }, [v.registration])

  const total = num(a.car_price) + (a.supplier_type === 'auto1' ? num(a.fees_ht) + num(a.transport_ht) : 0) + (a.supplier_type === 'professionnel' && a.has_vat ? num(a.pro_vat) : 0)
  const target = num(v.estimated_value)
  const marginTTC = target - num(a.car_price)
  const vatMargin = Math.max(0, marginTTC) / 6
  const netAfterVat = target ? target - total - vatMargin : null

  const step1Valid = v.brand.trim() && v.model.trim()
  const step2Valid = a.date_buy && num(a.car_price) > 0

  const submit = async () => {
    setSaving(true)
    try {
      const vehicle = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''))
      for (const k of ['year', 'km', 'doors', 'seats']) if (vehicle[k]) vehicle[k] = parseInt(vehicle[k])
      if (vehicle.estimated_value) vehicle.estimated_value = num(vehicle.estimated_value)
      const isAuto1 = a.supplier_type === 'auto1'
      const res = await apiJSON('/fiscal/purchase', 'POST', {
        vehicle, supplier_type: a.supplier_type, supplier_name: a.supplier_name || null, date_buy: a.date_buy,
        car_price: num(a.car_price), car_invoice_ref: a.car_invoice_ref || null,
        fees_ht: isAuto1 ? num(a.fees_ht) : 0, fees_ref: isAuto1 ? (a.fees_ref || null) : null,
        transport_ht: isAuto1 ? num(a.transport_ht) : 0, transport_ref: isAuto1 ? (a.transport_ref || null) : null,
        pro_vat: a.supplier_type === 'professionnel' && a.has_vat ? num(a.pro_vat) : 0,
      })
      const id = res.id
      // Factures → Documents + justificatif correspondant
      const docJobs = [['car', a.supplier_type === 'particulier' ? 'Certificat de cession (achat)' : 'Facture véhicule', a.car_invoice_ref],
                       ['fees', 'Facture frais Auto1', a.fees_ref], ['transport', 'Facture transport Auto1', a.transport_ref]]
      for (const [k, label, ref] of docJobs) {
        if (!files[k] || !res.entries?.[k]) continue
        const doc = await uploadDocument({ file: files[k], vehicleId: id, category: k === 'car' && a.supplier_type === 'particulier' ? 'DA - Achat' : 'Facture', name: `${label}${ref ? ` ${ref}` : ''}`, date: a.date_buy })
        await setChecklist(`entry:${res.entries[k]}`, { document_id: doc.id, status: 'classé' })
      }
      // Photos (la première devient la photo principale)
      for (const [i, file] of files.photos.entries()) {
        const path = `${id}/${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`
        const { error } = await supabase.storage.from('images').upload(path, file)
        if (error) continue
        const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(path)
        const img = await apiJSON(`/vehicles/${id}/images/url`, 'POST', { url: publicUrl, description: '' })
        if (i === 0) await fetch(`${API_URL}/images/${img.id}/main?vehicle_id=${id}`, { method: 'PUT' })
      }
      toast.success('Véhicule ajouté')
      router.push(`/app/vehicles/${id}`)
    } catch (e) {
      toast.error(e.message)
      setSaving(false)
    }
  }

  const STEPS = ['Le véhicule', "L'achat", 'Photos et factures']
  return (
    <div>
      <div className="wizard-steps">
        {STEPS.map((s, i) => <div key={s} className={`wizard-step${step === i + 1 ? ' active' : ''}${step > i + 1 ? ' done' : ''}`}>{i + 1}. {s}</div>)}
      </div>

      {step === 1 && (
        <>
          <div className="form-grid-2">
            <F label="Immatriculation" hint={dup ? null : 'Format AA-123-AA'}>
              <input className="form-input" value={v.registration} onChange={e => setVF('registration', formatRegistration(e.target.value))} placeholder="AA-123-AA" autoFocus />
              {dup && <span className="form-error">Déjà enregistrée : <a className="doc-link-main" href={`/app/vehicles/${dup.id}`}>{dup.brand} {dup.model}</a></span>}
            </F>
            <F label="Kilométrage"><input className="form-input" inputMode="numeric" value={v.km} onChange={e => setVF('km', e.target.value.replace(/\D/g, ''))} placeholder="Ex : 120000" /></F>
            <F label="Marque" required><input className="form-input" value={v.brand} onChange={e => setVF('brand', e.target.value)} placeholder="Ex : Renault" /></F>
            <F label="Modèle" required><input className="form-input" value={v.model} onChange={e => setVF('model', e.target.value)} placeholder="Ex : Clio IV" /></F>
            <F label="Version / finition"><input className="form-input" value={v.version} onChange={e => setVF('version', e.target.value)} placeholder="Ex : 0.9 TCe Intens" /></F>
            <F label="Année"><input className="form-input" inputMode="numeric" value={v.year} onChange={e => setVF('year', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Ex : 2015" /></F>
            <F label="Énergie">
              <div className="segmented" style={{ flexWrap: 'wrap' }}>
                {FUELS.slice(0, 4).map(f => <button type="button" key={f} className={`segmented-btn${v.fuel === f ? ' active' : ''}`} onClick={() => setVF('fuel', f)}>{f}</button>)}
              </div>
            </F>
            <F label="Boîte">
              <div className="segmented">
                {GEARBOXES.map(g => <button type="button" key={g} className={`segmented-btn${v.gearbox === g ? ' active' : ''}`} onClick={() => setVF('gearbox', g)}>{g}</button>)}
              </div>
            </F>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setMore(m => !m)} style={{ paddingLeft: 0 }}>
            {more ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Plus de détails (VIN, couleur, carrosserie…)
          </button>
          {more && (
            <div className="form-grid-3" style={{ marginTop: 12 }}>
              <F label="N° VIN"><input className="form-input" value={v.vin} onChange={e => setVF('vin', e.target.value.toUpperCase())} placeholder="17 caractères" /></F>
              <F label="Couleur"><input className="form-input" value={v.color} onChange={e => setVF('color', e.target.value)} /></F>
              <F label="Carrosserie">
                <select className="form-input" value={v.type} onChange={e => setVF('type', e.target.value)}><option value="">—</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
              </F>
              <F label="Énergie (autre)">
                <select className="form-input" value={v.fuel} onChange={e => setVF('fuel', e.target.value)}><option value="">—</option>{FUELS.map(t => <option key={t}>{t}</option>)}</select>
              </F>
              <F label="Portes"><input className="form-input" inputMode="numeric" value={v.doors} onChange={e => setVF('doors', e.target.value.replace(/\D/g, ''))} /></F>
              <F label="Places"><input className="form-input" inputMode="numeric" value={v.seats} onChange={e => setVF('seats', e.target.value.replace(/\D/g, ''))} /></F>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <label className="form-label">Acheté auprès de</label>
          <div className="choice-grid">
            {[['auto1', 'Auto1', 'Facture véhicule « TVA sur marge » + frais de services'], ['particulier', 'Un particulier', 'Certificat de cession, pas de TVA'], ['professionnel', 'Un garage / pro français', 'Facture « TVA sur marge » ou avec TVA']].map(([k, t, sub]) => (
              <button type="button" key={k} className={`choice${a.supplier_type === k ? ' active' : ''}`} onClick={() => setAF('supplier_type', k)}>
                <div className="choice-title">{t}</div><div className="choice-sub">{sub}</div>
              </button>
            ))}
          </div>
          <div className="form-grid-2">
            <F label="Date d'achat" required><input type="date" className="form-input" value={a.date_buy} onChange={e => setAF('date_buy', e.target.value)} /></F>
            {a.supplier_type !== 'auto1' && <F label="Nom du vendeur"><input className="form-input" value={a.supplier_name} onChange={e => setAF('supplier_name', e.target.value)} /></F>}
            <F label={a.supplier_type === 'auto1' ? 'Prix du véhicule seul (facture véhicule)' : a.supplier_type === 'particulier' ? 'Prix payé (certificat de cession)' : 'Prix du véhicule (HT si TVA facturée)'} required
               hint={a.supplier_type === 'auto1' ? "Sans les frais : c'est la base de la TVA sur marge à la revente." : null}>
              <input className="form-input" inputMode="decimal" value={a.car_price} onChange={e => setAF('car_price', e.target.value)} placeholder="Ex : 1 900" />
            </F>
            <F label={a.supplier_type === 'particulier' ? 'Référence (facultatif)' : 'N° de facture du véhicule'}><input className="form-input" value={a.car_invoice_ref} onChange={e => setAF('car_invoice_ref', e.target.value)} placeholder={a.supplier_type === 'auto1' ? '9001260…' : ''} /></F>
            {a.supplier_type === 'auto1' && <>
              <F label="Frais de services Auto1 (HT)" hint="Facture AUTO1 Berlin, sans TVA : autoliquidée automatiquement."><input className="form-input" inputMode="decimal" value={a.fees_ht} onChange={e => setAF('fees_ht', e.target.value)} placeholder="Ex : 763" /></F>
              <F label="N° facture des frais"><input className="form-input" value={a.fees_ref} onChange={e => setAF('fees_ref', e.target.value)} placeholder="1002601…" /></F>
              <F label="Transport Auto1 (HT, facultatif)"><input className="form-input" inputMode="decimal" value={a.transport_ht} onChange={e => setAF('transport_ht', e.target.value)} /></F>
              <F label="N° facture du transport"><input className="form-input" value={a.transport_ref} onChange={e => setAF('transport_ref', e.target.value)} /></F>
            </>}
            {a.supplier_type === 'professionnel' && (
              <F label="La facture affiche-t-elle de la TVA ?">
                <div className="segmented">
                  <button type="button" className={`segmented-btn${!a.has_vat ? ' active' : ''}`} onClick={() => setAF('has_vat', false)}>Non (TVA sur marge)</button>
                  <button type="button" className={`segmented-btn${a.has_vat ? ' active' : ''}`} onClick={() => setAF('has_vat', true)}>Oui</button>
                </div>
                {a.has_vat && <input className="form-input" style={{ marginTop: 8 }} inputMode="decimal" value={a.pro_vat} onChange={e => setAF('pro_vat', e.target.value)} placeholder="Montant de TVA" />}
              </F>
            )}
            <F label="Prix de vente visé (facultatif)" hint="Pour estimer votre marge nette après TVA."><input className="form-input" inputMode="decimal" value={v.estimated_value} onChange={e => setVF('estimated_value', e.target.value)} placeholder="Ex : 4 500" /></F>
          </div>
          <div className="summary-box">
            <div className="row"><span>Total payé</span><b>{eur(total, 2)}</b></div>
            {a.supplier_type === 'auto1' && num(a.fees_ht) + num(a.transport_ht) > 0 && <div className="row"><span>TVA autoliquidée (déclarée et déduite, coût 0 €)</span><span>{eur((num(a.fees_ht) + num(a.transport_ht)) * 0.2, 2)}</span></div>}
            {target > 0 && <>
              <div className="row"><span>TVA sur marge à la revente ({eur(target)} − {eur(num(a.car_price))}) × 1/6</span><span>{eur(vatMargin, 2)}</span></div>
              <div className="row"><span>Marge nette estimée (avant travaux)</span><b style={{ color: netAfterVat >= 0 ? 'var(--success)' : 'var(--danger)' }}>{eur(netAfterVat, 2)}</b></div>
            </>}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="form-hint" style={{ marginBottom: 12 }}>Facultatif : vous pourrez aussi les ajouter plus tard depuis la fiche ou l'onglet Justificatifs.</p>
          <FileSlot label={a.supplier_type === 'particulier' ? "Certificat de cession signé par le vendeur" : 'Facture du véhicule'} hint="PDF ou photo" file={files.car} onChange={f => setFiles(p => ({ ...p, car: f }))} />
          {a.supplier_type === 'auto1' && num(a.fees_ht) > 0 && <FileSlot label="Facture des frais de services Auto1" hint="PDF" file={files.fees} onChange={f => setFiles(p => ({ ...p, fees: f }))} />}
          {a.supplier_type === 'auto1' && num(a.transport_ht) > 0 && <FileSlot label="Facture du transport Auto1" hint="PDF" file={files.transport} onChange={f => setFiles(p => ({ ...p, transport: f }))} />}
          <div className="check-item" style={{ padding: '10px 0' }}>
            <div>
              <div className="check-item-title">Photos du véhicule</div>
              <div className="check-item-meta">{files.photos.length ? `${files.photos.length} photo(s) — la première sera la photo principale` : 'JPG, PNG'}</div>
            </div>
            <div className="check-item-actions">
              <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={e => setFiles(p => ({ ...p, photos: [...p.photos, ...Array.from(e.target.files || [])] }))} />
              <button type="button" className="file-btn" onClick={() => photoRef.current?.click()}><Camera size={13} /> Ajouter</button>
            </div>
          </div>
        </>
      )}

      <div className="wizard-actions">
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 1 && <button type="button" className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>← Précédent</button>}
          {step === 1 && onSwitchToFull && <button type="button" className="btn btn-ghost" onClick={onSwitchToFull}>Formulaire complet</button>}
        </div>
        {step < 3
          ? <button type="button" className="btn btn-primary" disabled={step === 1 ? !step1Valid : !step2Valid} onClick={() => setStep(s => s + 1)}>Suivant →</button>
          : <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? 'Création…' : 'Créer le véhicule'}</button>}
      </div>
    </div>
  )
}
