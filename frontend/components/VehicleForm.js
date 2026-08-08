/**
 * VehicleForm — Formulaire complet d'ajout/modification de véhicule
 * Organisé en 4 onglets : Général, Financier, Technique, Notes
 */
import { useState } from 'react'

const TABS = [
  { id: 'general',   label: 'Général' },
  { id: 'financial', label: 'Financier' },
  { id: 'technical', label: 'Technique' },
  { id: 'notes',     label: 'Notes & Perso' },
]

const VEHICLE_TYPES  = ['Berline', 'SUV / 4x4', 'Coupé', 'Cabriolet', 'Break', 'Monospace', 'Utilitaire', 'Camionnette', 'Moto', 'Autre']
const FUELS          = ['Essence', 'Diesel', 'Électrique', 'Hybride', 'Hybride rechargeable', 'GPL', 'GNV', 'Hydrogène', 'Autre']
const GEARBOXES      = ['Manuelle', 'Automatique', 'Séquentielle', 'CVT', 'Autre']
const STATUSES       = ['en stock', 'vendu', 'en réparation', 'réservé', 'hors service']
const STATES         = ['', 'excellent', 'bon', 'correct', 'mauvais']

function Field({ label, required, hint, error, children }) {
  return (
    <div className="form-group">
      <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
      {children}
      {hint  && <span className="form-hint">{hint}</span>}
      {error && <span className="form-error">{error}</span>}
    </div>
  )
}

function Input({ name, type = 'text', value, onChange, placeholder, min, step }) {
  return (
    <input
      className="form-input"
      type={type}
      name={name}
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      min={min}
      step={step}
    />
  )
}

function Select({ name, value, onChange, options, placeholder = '— Sélectionner —' }) {
  return (
    <select className="form-input" name={name} value={value ?? ''} onChange={onChange}>
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  )
}

export default function VehicleForm({ initialData = {}, onSubmit, loading, submitLabel = 'Enregistrer' }) {
  const [activeTab, setActiveTab] = useState('general')
  const [form, setForm] = useState({
    // Général
    brand: '', model: '', version: '', year: '', registration: '', vin: '',
    type: '', fuel: '', gearbox: '', color: '', doors: '', seats: '',
    status: 'en stock',
    // Financier
    km: '', date_buy: '', price_buy: '', date_sell: '', price_sell: '', estimated_value: '',
    // Technique
    date_last_service: '', date_next_service: '', date_last_ct: '', date_next_ct: '',
    engine_state: '', body_state: '', tire_state: '', interior_state: '',
    // Notes
    notes: '', internal_notes: '',
    // Champs personnalisés
    custom_fields: '{}',
    ...initialData,
  })
  const [errors, setErrors] = useState({})
  const [customFields, setCustomFields] = useState(() => {
    try { return Object.entries(JSON.parse(initialData.custom_fields || '{}')).map(([k, v]) => ({ k, v })) }
    catch { return [] }
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }))
  }

  const validate = () => {
    const e = {}
    if (!form.brand?.trim()) e.brand = 'La marque est obligatoire'
    if (!form.model?.trim()) e.model = 'Le modèle est obligatoire'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (evt) => {
    evt.preventDefault()
    if (!validate()) { setActiveTab('general'); return }

    // Build custom_fields JSON
    const cfObj = {}
    customFields.forEach(({ k, v }) => { if (k.trim()) cfObj[k.trim()] = v })

    const payload = {
      ...form,
      year:           form.year      ? parseInt(form.year)      : null,
      km:             form.km        ? parseInt(form.km)        : null,
      doors:          form.doors     ? parseInt(form.doors)     : null,
      seats:          form.seats     ? parseInt(form.seats)     : null,
      price_buy:      form.price_buy      ? parseFloat(form.price_buy)      : null,
      price_sell:     form.price_sell     ? parseFloat(form.price_sell)     : null,
      estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
      date_buy:       form.date_buy  || null,
      date_sell:      form.date_sell || null,
      date_last_service: form.date_last_service || null,
      date_next_service: form.date_next_service || null,
      date_last_ct:   form.date_last_ct  || null,
      date_next_ct:   form.date_next_ct  || null,
      custom_fields:  JSON.stringify(cfObj),
    }
    onSubmit(payload)
  }

  // Custom fields management
  const addCustomField = () => setCustomFields(prev => [...prev, { k: '', v: '' }])
  const removeCustomField = (i) => setCustomFields(prev => prev.filter((_, idx) => idx !== i))
  const updateCustomField = (i, key, val) => {
    setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, [key]: val } : f))
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* ── Tab navigation ── */}
      <div className="tab-bar" style={{ marginBottom: 28 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════ ONGLET GÉNÉRAL ══════════════ */}
      {activeTab === 'general' && (
        <>
          <div className="form-section">
            <div className="form-section-title">Identité du véhicule</div>
            <div className="form-grid-3">
              <Field label="Marque" required error={errors.brand}>
                <Input name="brand" value={form.brand} onChange={handleChange} placeholder="Ex: Renault" />
              </Field>
              <Field label="Modèle" required error={errors.model}>
                <Input name="model" value={form.model} onChange={handleChange} placeholder="Ex: Clio" />
              </Field>
              <Field label="Version / Finition">
                <Input name="version" value={form.version} onChange={handleChange} placeholder="Ex: Intens 130ch" />
              </Field>
              <Field label="Immatriculation" hint="Format : AA-123-AA">
                <Input name="registration" value={form.registration} onChange={handleChange} placeholder="AA-123-AA" />
              </Field>
              <Field label="Année">
                <Input name="year" type="number" value={form.year} onChange={handleChange} placeholder="Ex: 2020" min="1900" />
              </Field>
              <Field label="Numéro VIN">
                <Input name="vin" value={form.vin} onChange={handleChange} placeholder="17 caractères" />
              </Field>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Caractéristiques</div>
            <div className="form-grid-3">
              <Field label="Type de véhicule">
                <Select name="type" value={form.type} onChange={handleChange} options={VEHICLE_TYPES} />
              </Field>
              <Field label="Énergie / Motorisation">
                <Select name="fuel" value={form.fuel} onChange={handleChange} options={FUELS} />
              </Field>
              <Field label="Boîte de vitesses">
                <Select name="gearbox" value={form.gearbox} onChange={handleChange} options={GEARBOXES} />
              </Field>
              <Field label="Couleur">
                <Input name="color" value={form.color} onChange={handleChange} placeholder="Ex: Gris Platine" />
              </Field>
              <Field label="Nb de portes">
                <Input name="doors" type="number" value={form.doors} onChange={handleChange} placeholder="Ex: 5" min="2" />
              </Field>
              <Field label="Nb de places">
                <Input name="seats" type="number" value={form.seats} onChange={handleChange} placeholder="Ex: 5" min="1" />
              </Field>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Statut</div>
            <div className="form-grid-2">
              <Field label="Statut du véhicule">
                <Select name="status" value={form.status} onChange={handleChange} options={STATUSES} placeholder="— Statut —" />
              </Field>
            </div>
          </div>
        </>
      )}

      {/* ══════════════ ONGLET FINANCIER ══════════════ */}
      {activeTab === 'financial' && (
        <>
          <div className="form-section">
            <div className="form-section-title">Achat</div>
            <div className="form-grid-3">
              <Field label="Date d'achat">
                <Input name="date_buy" type="date" value={form.date_buy} onChange={handleChange} />
              </Field>
              <Field label="Prix d'achat (€)">
                <Input name="price_buy" type="number" value={form.price_buy} onChange={handleChange} placeholder="Ex: 8500" min="0" step="0.01" />
              </Field>
              <Field label="Kilométrage à l'achat">
                <Input name="km" type="number" value={form.km} onChange={handleChange} placeholder="Ex: 85000" min="0" />
              </Field>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Vente</div>
            <div className="form-grid-3">
              <Field label="Date de vente">
                <Input name="date_sell" type="date" value={form.date_sell} onChange={handleChange} />
              </Field>
              <Field label="Prix de vente (€)">
                <Input name="price_sell" type="number" value={form.price_sell} onChange={handleChange} placeholder="Ex: 10500" min="0" step="0.01" />
              </Field>
              <Field label="Valeur estimée actuelle (€)" hint="Estimation marché actuel">
                <Input name="estimated_value" type="number" value={form.estimated_value} onChange={handleChange} placeholder="Ex: 9000" min="0" step="0.01" />
              </Field>
            </div>
          </div>

          {/* Résumé profit si les deux prix sont renseignés */}
          {form.price_buy && form.price_sell && (
            <div style={{
              padding: '16px 20px',
              background: (parseFloat(form.price_sell) - parseFloat(form.price_buy)) >= 0
                ? 'rgba(0,212,170,.08)' : 'rgba(255,77,109,.08)',
              border: `1px solid ${(parseFloat(form.price_sell) - parseFloat(form.price_buy)) >= 0
                ? 'rgba(0,212,170,.2)' : 'rgba(255,77,109,.2)'}`,
              borderRadius: 'var(--radius-md)',
              marginTop: 4,
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Marge brute : </span>
              <span style={{
                fontSize: 16,
                fontWeight: 700,
                color: (parseFloat(form.price_sell) - parseFloat(form.price_buy)) >= 0
                  ? 'var(--success)' : 'var(--danger)',
              }}>
                {((parseFloat(form.price_sell) - parseFloat(form.price_buy))).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>(hors charges)</span>
            </div>
          )}
        </>
      )}

      {/* ══════════════ ONGLET TECHNIQUE ══════════════ */}
      {activeTab === 'technical' && (
        <>
          <div className="form-section">
            <div className="form-section-title">Entretien</div>
            <div className="form-grid-2">
              <Field label="Date du dernier entretien">
                <Input name="date_last_service" type="date" value={form.date_last_service} onChange={handleChange} />
              </Field>
              <Field label="Date du prochain entretien">
                <Input name="date_next_service" type="date" value={form.date_next_service} onChange={handleChange} />
              </Field>
              <Field label="Date du dernier contrôle technique">
                <Input name="date_last_ct" type="date" value={form.date_last_ct} onChange={handleChange} />
              </Field>
              <Field label="Date du prochain contrôle technique">
                <Input name="date_next_ct" type="date" value={form.date_next_ct} onChange={handleChange} />
              </Field>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">État général</div>
            <div className="form-grid-2">
              <Field label="État du moteur">
                <Select name="engine_state" value={form.engine_state} onChange={handleChange} options={STATES.filter(s => s)} placeholder="— État moteur —" />
              </Field>
              <Field label="État de la carrosserie">
                <Select name="body_state" value={form.body_state} onChange={handleChange} options={STATES.filter(s => s)} placeholder="— État carrosserie —" />
              </Field>
              <Field label="État des pneus">
                <Select name="tire_state" value={form.tire_state} onChange={handleChange} options={['neuf', 'bon', 'correct', 'usé']} placeholder="— État pneus —" />
              </Field>
              <Field label="État de l'intérieur">
                <Select name="interior_state" value={form.interior_state} onChange={handleChange} options={STATES.filter(s => s)} placeholder="— État intérieur —" />
              </Field>
            </div>
          </div>
        </>
      )}

      {/* ══════════════ ONGLET NOTES ══════════════ */}
      {activeTab === 'notes' && (
        <>
          <div className="form-section">
            <div className="form-section-title">Notes</div>
            <div className="form-group">
              <label className="form-label">Notes générales</label>
              <textarea
                className="form-input"
                name="notes"
                value={form.notes ?? ''}
                onChange={handleChange}
                rows={4}
                placeholder="Informations visibles, historique, observations..."
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label">Notes internes</label>
              <textarea
                className="form-input"
                name="internal_notes"
                value={form.internal_notes ?? ''}
                onChange={handleChange}
                rows={3}
                placeholder="Notes privées, commentaires internes..."
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Champs personnalisés</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Ajoutez des informations supplémentaires libres (ex : Origine, Garantie, Options…)
            </p>
            {customFields.map((f, i) => (
              <div className="custom-field-row" key={i}>
                <input
                  className="form-input"
                  placeholder="Nom du champ"
                  value={f.k}
                  onChange={e => updateCustomField(i, 'k', e.target.value)}
                  style={{ maxWidth: 180 }}
                />
                <input
                  className="form-input"
                  placeholder="Valeur"
                  value={f.v}
                  onChange={e => updateCustomField(i, 'v', e.target.value)}
                />
                <button type="button" className="btn-icon danger" onClick={() => removeCustomField(i)}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: 13 }} onClick={addCustomField}>
              + Ajouter un champ
            </button>
          </div>
        </>
      )}

      {/* ── Actions ── */}
      <div style={{
        display: 'flex',
        gap: 12,
        justifyContent: 'flex-end',
        paddingTop: 24,
        borderTop: '1px solid var(--border)',
        marginTop: 8,
      }}>
        <button type="button" className="btn btn-ghost" onClick={() => window.history.back()}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? '⟳ Enregistrement...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
