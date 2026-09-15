import { useEffect, useState } from 'react'
import useSWR from 'swr'
import Layout from '../../components/Layout'
import { buildInvoicePDF, buildProcurationPDF } from '../../lib/pdfGenerator'
import { Receipt, FileSignature, Plus, Trash2, Download, Wand2 } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

const ITEM_CATS = ['Main d’œuvre', 'Pièce', 'Entretien', 'Réparation', 'Diagnostic', 'Forfait', 'Autre']
const PURPOSE_PRESETS = [
  'Immatriculation du véhicule (carte grise)',
  'Vente du véhicule',
  'Achat du véhicule',
  'Contrôle technique',
  'Récupération / restitution du véhicule',
  'Démarches administratives diverses',
]

const money = (n) => `${(Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const todayISO = () => new Date().toISOString().slice(0, 10)
const genInvoiceNumber = () => `FA-${todayISO().replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`

const emptyCompany = { name: '', address: '', zip: '', city: '', phone: '', email: '', siret: '' }
const emptyClient = { name: '', address: '', zip: '', city: '', phone: '', email: '' }
const emptyItem = () => ({ description: '', category: '', qty: 1, unitPrice: '' })
const emptyPerson = { name: '', address: '', zip: '', city: '', idNumber: '' }
const emptyVehicleInfo = { brand: '', model: '', registration: '', vin: '' }

export default function PdfGenerator() {
  const [docType, setDocType] = useState('facture')

  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)

  // ── Informations société, persistées localement (sur ce poste uniquement) ──
  const [company, setCompany] = useState(emptyCompany)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dashauto_company_profile')
      if (saved) setCompany(JSON.parse(saved))
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('dashauto_company_profile', JSON.stringify(company)) } catch {}
  }, [company])
  const setCompanyField = (k, v) => setCompany(p => ({ ...p, [k]: v }))

  // ── Facture ──
  const [invoiceNumber, setInvoiceNumber] = useState(genInvoiceNumber())
  const [invoiceDate, setInvoiceDate] = useState(todayISO())
  const [dueDate, setDueDate] = useState('')
  const [client, setClient] = useState(emptyClient)
  const [invVehicleId, setInvVehicleId] = useState('')
  const [invVehicle, setInvVehicle] = useState(null)
  const [items, setItems] = useState([emptyItem()])
  const [taxRate, setTaxRate] = useState(20)
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)

  const setClientField = (k, v) => setClient(p => ({ ...p, [k]: v }))
  const setItemField = (idx, k, v) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [k]: v } : it))
  const addItem = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const onInvVehicleChange = (id) => {
    setInvVehicleId(id)
    const v = vehicles?.find(x => String(x.id) === String(id))
    setInvVehicle(v ? { brand: v.brand, model: v.model, registration: v.registration, vin: v.vin } : null)
  }

  const loadVehicleCosts = async () => {
    if (!invVehicleId) return
    try {
      const [interventions, charges] = await Promise.all([
        fetch(`${API_URL}/vehicles/${invVehicleId}/interventions`).then(r => r.json()),
        fetch(`${API_URL}/vehicles/${invVehicleId}/charges`).then(r => r.json()),
      ])
      const fromInterventions = (interventions || [])
        .filter(i => i.cost_actual != null || i.cost_estimated != null)
        .map(i => ({ description: i.title, category: i.category || 'Entretien', qty: 1, unitPrice: i.cost_actual ?? i.cost_estimated }))
      const fromCharges = (charges || [])
        .filter(c => c.category !== 'Achat')
        .map(c => ({ description: c.description || c.category, category: c.category, qty: 1, unitPrice: c.amount }))
      const loaded = [...fromInterventions, ...fromCharges]
      if (loaded.length === 0) return
      setItems(prev => (prev.length === 1 && !prev[0].description && !prev[0].unitPrice) ? loaded : [...prev, ...loaded])
    } catch {
      alert("Impossible de charger les travaux/charges de ce véhicule.")
    }
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
  const taxAmount = subtotal * (Number(taxRate) || 0) / 100
  const total = subtotal + taxAmount

  const generateInvoice = () => {
    if (!client.name.trim()) { alert('Merci de renseigner le nom du client.'); return }
    if (items.every(it => !it.description.trim())) { alert('Ajoutez au moins une ligne à la facture.'); return }
    setGenerating(true)
    try {
      const doc = buildInvoicePDF({ company, invoiceNumber, invoiceDate, dueDate, client, vehicle: invVehicle, items, taxRate, notes })
      doc.save(`${invoiceNumber}.pdf`)
    } finally {
      setGenerating(false)
    }
  }

  // ── Procuration ──
  const [mandant, setMandant] = useState(emptyPerson)
  const [mandataire, setMandataire] = useState(emptyPerson)
  const [procVehicleId, setProcVehicleId] = useState('')
  const [procVehicle, setProcVehicle] = useState(emptyVehicleInfo)
  const [purpose, setPurpose] = useState('')
  const [place, setPlace] = useState('')
  const [procDate, setProcDate] = useState(todayISO())

  const setMandantField = (k, v) => setMandant(p => ({ ...p, [k]: v }))
  const setMandataireField = (k, v) => setMandataire(p => ({ ...p, [k]: v }))
  const setProcVehicleField = (k, v) => setProcVehicle(p => ({ ...p, [k]: v }))

  const onProcVehicleChange = (id) => {
    setProcVehicleId(id)
    const v = vehicles?.find(x => String(x.id) === String(id))
    setProcVehicle(v ? { brand: v.brand || '', model: v.model || '', registration: v.registration || '', vin: v.vin || '' } : emptyVehicleInfo)
  }

  const useMyGarageAsMandataire = () => {
    setMandataire(p => ({ ...p, name: company.name || p.name, address: company.address || p.address, zip: company.zip || p.zip, city: company.city || p.city }))
  }

  const generateProcuration = () => {
    if (!mandant.name.trim() || !mandataire.name.trim()) { alert('Merci de renseigner le mandant et le mandataire.'); return }
    setGenerating(true)
    try {
      const doc = buildProcurationPDF({ mandant, mandataire, vehicle: procVehicle, purpose, place, date: procDate })
      doc.save(`Procuration-${(mandant.name || 'document').replace(/\s+/g, '_')}.pdf`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Layout title="Générateur PDF">
      <div className="page-header">
        <div>
          <h1 className="page-title">Générateur de documents</h1>
          <p className="page-subtitle">Créez une facture ou une procuration prête à imprimer, en quelques secondes.</p>
        </div>
      </div>

      <div className="page-body">
        <div style={{ marginBottom: 24 }}>
          <div className="segmented">
            <button className={`segmented-btn ${docType === 'facture' ? 'active' : ''}`} onClick={() => setDocType('facture')}>
              <Receipt size={15} style={{ marginRight: 6, verticalAlign: -3 }} /> Facture
            </button>
            <button className={`segmented-btn ${docType === 'procuration' ? 'active' : ''}`} onClick={() => setDocType('procuration')}>
              <FileSignature size={15} style={{ marginRight: 6, verticalAlign: -3 }} /> Procuration
            </button>
          </div>
        </div>

        <div className="dashboard-grid-2">
          {/* ── Colonne principale : formulaire ── */}
          <div className="card">
            {docType === 'facture' ? (
              <>
                <div className="form-section">
                  <div className="form-section-title">Vos informations (garage)</div>
                  <div className="form-grid-2">
                    <div className="form-group span-2">
                      <label className="form-label">Nom de la société</label>
                      <input className="form-input" value={company.name} onChange={e => setCompanyField('name', e.target.value)} placeholder="Garage Dupont" />
                    </div>
                    <div className="form-group span-2">
                      <label className="form-label">Adresse</label>
                      <input className="form-input" value={company.address} onChange={e => setCompanyField('address', e.target.value)} placeholder="12 rue de l'Atelier" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Code postal</label>
                      <input className="form-input" value={company.zip} onChange={e => setCompanyField('zip', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Ville</label>
                      <input className="form-input" value={company.city} onChange={e => setCompanyField('city', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Téléphone</label>
                      <input className="form-input" value={company.phone} onChange={e => setCompanyField('phone', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">E-mail</label>
                      <input className="form-input" value={company.email} onChange={e => setCompanyField('email', e.target.value)} />
                    </div>
                    <div className="form-group span-2">
                      <label className="form-label">SIRET</label>
                      <input className="form-input" value={company.siret} onChange={e => setCompanyField('siret', e.target.value)} />
                    </div>
                  </div>
                  <span className="form-hint">Ces informations sont enregistrées sur cet appareil et réutilisées automatiquement la prochaine fois.</span>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Facture</div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label className="form-label required">Numéro</label>
                      <input className="form-input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Date</label>
                      <input className="form-input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Échéance</label>
                      <input className="form-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Client</div>
                  <div className="form-grid-2">
                    <div className="form-group span-2">
                      <label className="form-label required">Nom / Raison sociale</label>
                      <input className="form-input" value={client.name} onChange={e => setClientField('name', e.target.value)} placeholder="Jean Martin" />
                    </div>
                    <div className="form-group span-2">
                      <label className="form-label">Adresse</label>
                      <input className="form-input" value={client.address} onChange={e => setClientField('address', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Code postal</label>
                      <input className="form-input" value={client.zip} onChange={e => setClientField('zip', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Ville</label>
                      <input className="form-input" value={client.city} onChange={e => setClientField('city', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Téléphone</label>
                      <input className="form-input" value={client.phone} onChange={e => setClientField('phone', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">E-mail</label>
                      <input className="form-input" value={client.email} onChange={e => setClientField('email', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Véhicule concerné (optionnel)</div>
                  <div className="inline-form-row">
                    <div className="form-group">
                      <label className="form-label">Sélectionner un véhicule</label>
                      <select className="form-input" value={invVehicleId} onChange={e => onInvVehicleChange(e.target.value)}>
                        <option value="">-- Aucun --</option>
                        {vehicles?.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.registration || 'sans immat.'})</option>)}
                      </select>
                    </div>
                    {invVehicleId && (
                      <button type="button" className="btn btn-outline" onClick={loadVehicleCosts} style={{ fontSize: 13 }}>
                        <Wand2 size={14} /> Charger travaux &amp; charges
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Lignes de facturation</div>
                  <div className="pdf-items">
                    <div className="pdf-items-labels">
                      <span>Description</span><span>Catégorie</span><span>Qté</span><span>PU HT</span><span>Total</span><span></span>
                    </div>
                    {items.map((it, idx) => (
                      <div className="pdf-item-row" key={idx}>
                        <input className="form-input" value={it.description} onChange={e => setItemField(idx, 'description', e.target.value)} placeholder="Ex : Vidange + filtre à huile" />
                        <select className="form-input" value={it.category} onChange={e => setItemField(idx, 'category', e.target.value)}>
                          <option value="">--</option>
                          {ITEM_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input className="form-input" type="number" min="0" step="1" value={it.qty} onChange={e => setItemField(idx, 'qty', e.target.value)} />
                        <input className="form-input" type="number" min="0" step="0.01" value={it.unitPrice} onChange={e => setItemField(idx, 'unitPrice', e.target.value)} placeholder="0.00" />
                        <span className="pdf-item-total">{money((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</span>
                        <button type="button" className="btn-icon danger" onClick={() => removeItem(idx)} title="Supprimer la ligne"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={addItem} style={{ marginTop: 12, fontSize: 13 }}>
                    <Plus size={14} /> Ajouter une ligne
                  </button>
                </div>

                <div className="form-section">
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Taux de TVA (%)</label>
                      <input className="form-input" type="number" min="0" max="100" step="0.1" value={taxRate} onChange={e => setTaxRate(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes / conditions de paiement</label>
                    <textarea className="form-input form-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex : Paiement à réception, RIB : ..." />
                  </div>
                </div>

                <button className="btn btn-primary" onClick={generateInvoice} disabled={generating} style={{ width: '100%' }}>
                  <Download size={16} /> {generating ? 'Génération...' : 'Générer la facture PDF'}
                </button>
              </>
            ) : (
              <>
                <div className="form-section">
                  <div className="form-section-title">Mandant (donne procuration)</div>
                  <div className="form-grid-2">
                    <div className="form-group span-2">
                      <label className="form-label required">Nom complet</label>
                      <input className="form-input" value={mandant.name} onChange={e => setMandantField('name', e.target.value)} placeholder="Jean Martin" />
                    </div>
                    <div className="form-group span-2">
                      <label className="form-label">Adresse</label>
                      <input className="form-input" value={mandant.address} onChange={e => setMandantField('address', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Code postal</label>
                      <input className="form-input" value={mandant.zip} onChange={e => setMandantField('zip', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Ville</label>
                      <input className="form-input" value={mandant.city} onChange={e => setMandantField('city', e.target.value)} />
                    </div>
                    <div className="form-group span-2">
                      <label className="form-label">N° pièce d'identité</label>
                      <input className="form-input" value={mandant.idNumber} onChange={e => setMandantField('idNumber', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Mandataire (reçoit procuration)</div>
                  <div style={{ marginBottom: 12 }}>
                    <button type="button" className="btn btn-outline" onClick={useMyGarageAsMandataire} style={{ fontSize: 12.5 }}>
                      <Wand2 size={13} /> Utiliser mes informations (garage)
                    </button>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group span-2">
                      <label className="form-label required">Nom complet</label>
                      <input className="form-input" value={mandataire.name} onChange={e => setMandataireField('name', e.target.value)} placeholder="Marie Durand" />
                    </div>
                    <div className="form-group span-2">
                      <label className="form-label">Adresse</label>
                      <input className="form-input" value={mandataire.address} onChange={e => setMandataireField('address', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Code postal</label>
                      <input className="form-input" value={mandataire.zip} onChange={e => setMandataireField('zip', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Ville</label>
                      <input className="form-input" value={mandataire.city} onChange={e => setMandataireField('city', e.target.value)} />
                    </div>
                    <div className="form-group span-2">
                      <label className="form-label">N° pièce d'identité</label>
                      <input className="form-input" value={mandataire.idNumber} onChange={e => setMandataireField('idNumber', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Véhicule concerné</div>
                  <div className="form-group">
                    <label className="form-label">Sélectionner un véhicule existant</label>
                    <select className="form-input" value={procVehicleId} onChange={e => onProcVehicleChange(e.target.value)}>
                      <option value="">-- Saisir manuellement --</option>
                      {vehicles?.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.registration || 'sans immat.'})</option>)}
                    </select>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Marque</label>
                      <input className="form-input" value={procVehicle.brand} onChange={e => setProcVehicleField('brand', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Modèle</label>
                      <input className="form-input" value={procVehicle.model} onChange={e => setProcVehicleField('model', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Immatriculation</label>
                      <input className="form-input" value={procVehicle.registration} onChange={e => setProcVehicleField('registration', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">VIN</label>
                      <input className="form-input" value={procVehicle.vin} onChange={e => setProcVehicleField('vin', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Objet de la procuration</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {PURPOSE_PRESETS.map(p => (
                      <button type="button" key={p} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setPurpose(p)}>{p}</button>
                    ))}
                  </div>
                  <div className="form-group">
                    <textarea className="form-input form-textarea" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Décrivez précisément les démarches autorisées..." />
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Fait à (lieu)</label>
                      <input className="form-input" value={place} onChange={e => setPlace(e.target.value)} placeholder="Paris" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date</label>
                      <input className="form-input" type="date" value={procDate} onChange={e => setProcDate(e.target.value)} />
                    </div>
                  </div>
                </div>

                <button className="btn btn-primary" onClick={generateProcuration} disabled={generating} style={{ width: '100%' }}>
                  <Download size={16} /> {generating ? 'Génération...' : 'Générer la procuration PDF'}
                </button>
              </>
            )}
          </div>

          {/* ── Colonne aperçu ── */}
          <div>
            {docType === 'facture' ? (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-title">Récapitulatif</span>
                </div>
                <div className="mini-stat-row">
                  <span className="mini-stat-label">Sous-total HT</span>
                  <span className="mini-stat-value">{money(subtotal)}</span>
                </div>
                <div className="mini-stat-row">
                  <span className="mini-stat-label">TVA ({Number(taxRate) || 0}%)</span>
                  <span className="mini-stat-value">{money(taxAmount)}</span>
                </div>
                <div className="mini-stat-row">
                  <span className="mini-stat-label" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total TTC</span>
                  <span className="mini-stat-value positive" style={{ fontSize: 18 }}>{money(total)}</span>
                </div>
              </div>
            ) : (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-title">Aperçu</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  La procuration autorise <strong>{mandataire.name || 'le mandataire'}</strong> à agir au nom de <strong>{mandant.name || 'le mandant'}</strong>{procVehicle.registration ? <> pour le véhicule <strong>{procVehicle.registration}</strong></> : null}.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
