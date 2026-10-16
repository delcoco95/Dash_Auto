/**
 * Simulateur : estimer la TVA d'un mois (régime de la marge) ou l'impôt sur les sociétés d'une année,
 * à partir des données du site, avec la possibilité d'ajouter des ventes « et si… ».
 * Rien n'est enregistré : c'est une estimation indicative.
 */
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import Layout from '../../../components/Layout'
import AdminTabs from '../../../components/AdminTabs'
import { API_URL } from '../../../lib/api'
import { fmt, vehicleLabel } from '../../../lib/format'
import { Plus, Trash2, Info } from 'lucide-react'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const num = (x) => { const n = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const vatOnMargin = (sell, buy) => Math.max(0, num(sell) - num(buy)) / 6   // marge TTC × 20/120

function Money({ value, onChange, placeholder }) {
  return <input title={placeholder} aria-label={placeholder} className="form-input sim-input" inputMode="decimal" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
}

function Line({ label, value, strong, sign, hint }) {
  return (
    <div className={`sim-line${strong ? ' strong' : ''}`}>
      <span>{label}{hint && <small>{hint}</small>}</span>
      <span>{sign}{fmt(value)}</span>
    </div>
  )
}

// Liste des ventes : celles du site (modifiables) + ventes simulées de véhicules en stock.
function SalesTable({ rows, setRows, stock, showCosts }) {
  const [pick, setPick] = useState('')
  const update = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const addSim = () => {
    const v = stock.find(s => String(s.id) === pick)
    if (!v) return
    setRows([...rows, { key: `sim-${v.id}-${Date.now()}`, label: vehicleLabel(v), sell: v.target ?? '', buy: v.buy ?? '', costs: v.costs ?? 0, simulated: true }])
    setPick('')
  }
  return (
    <div className="sim-sales">
      <div className={`sim-sale head${showCosts ? ' costs' : ''}`}>
        <span>Véhicule</span><span>Vendu à</span><span>Acheté à</span>{showCosts && <span>Frais</span>}<span>{showCosts ? 'Bénéfice' : 'TVA sur marge'}</span><span />
      </div>
      {rows.map((r, i) => (
        <div key={r.key} className={`sim-sale${showCosts ? ' costs' : ''}${r.simulated ? ' simulated' : ''}`}>
          <span className="sim-veh">{r.label}{r.simulated && <em>simulée</em>}</span>
          <Money value={r.sell} placeholder="Vendu à" onChange={v => update(i, 'sell', v)} />
          <Money value={r.buy} placeholder="Acheté à" onChange={v => update(i, 'buy', v)} />
          {showCosts && <Money value={r.costs} placeholder="Frais" onChange={v => update(i, 'costs', v)} />}
          <b>{showCosts ? fmt(num(r.sell) - vatOnMargin(r.sell, r.buy) - num(r.buy) - num(r.costs)) : fmt(vatOnMargin(r.sell, r.buy))}</b>
          <button className="sim-del" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 size={14} /></button>
        </div>
      ))}
      {rows.length === 0 && <div className="muted" style={{ padding: '10px 0', fontSize: 13 }}>Aucune vente sur la période.</div>}
      <div className="sim-add">
        <select className="form-input" value={pick} onChange={e => setPick(e.target.value)}>
          <option value="">Et si je vendais… (véhicule en stock)</option>
          {stock.map(s => <option key={s.id} value={s.id}>{vehicleLabel(s)}{s.target ? ` — visé ${fmt(s.target)}` : ''}</option>)}
        </select>
        <button className="btn btn-outline" onClick={addSim} disabled={!pick}><Plus size={15} /> Ajouter</button>
      </div>
    </div>
  )
}

export default function Simulateur() {
  const now = new Date()
  const [mode, setMode] = useState('tva')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)
  const { data: stats } = useSWR(`${API_URL}/stats`, fetcher)
  const { data: entries } = useSWR(`${API_URL}/fiscal/entries`, fetcher)
  const { data: settings } = useSWR(`${API_URL}/fiscal/settings`, fetcher)

  // Prix du véhicule seul (sans frais Auto1) quand la facture est connue, sinon prix d'achat saisi.
  const carPrice = useMemo(() => {
    const m = {}
    for (const e of entries || []) if (e.kind === 'achat_vehicule_marge' && e.vehicle_id) m[e.vehicle_id] = (m[e.vehicle_id] || 0) + (e.amount_ht || 0)
    return m
  }, [entries])
  const perVehicle = useMemo(() => Object.fromEntries((stats?.per_vehicle || []).map(p => [p.vehicle_id, p])), [stats])
  const excluded = useMemo(() => new Set(stats?.excluded_vehicle_ids || []), [stats])
  const tracked = (vehicles || []).filter(v => !excluded.has(v.id))
  const stock = tracked.filter(v => !perVehicle[v.id]?.sold).map(v => ({
    ...v, buy: mode === 'tva' ? (carPrice[v.id] ?? v.price_buy) : v.price_buy,
    target: v.price_sell, costs: (perVehicle[v.id]?.charges || 0) + (perVehicle[v.id]?.works || 0),
  }))

  // ── TVA du mois ──
  const [tvaRows, setTvaRows] = useState([])
  const [deductible, setDeductible] = useState('')
  const [credit, setCredit] = useState('')
  useEffect(() => {
    if (!vehicles || !stats) return
    setTvaRows(tracked.filter(v => perVehicle[v.id]?.sold && v.date_sell && new Date(v.date_sell).getFullYear() === year && new Date(v.date_sell).getMonth() + 1 === month)
      .map(v => ({ key: `v${v.id}`, label: vehicleLabel(v), sell: v.price_sell ?? '', buy: carPrice[v.id] ?? v.price_buy ?? '' })))
  }, [vehicles, stats, entries, year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  const collected = tvaRows.reduce((a, r) => a + vatOnMargin(r.sell, r.buy), 0)
  const net = collected - num(deductible) - num(credit)

  // ── IS de l'année ──
  const [isRows, setIsRows] = useState([])
  const [otherCharges, setOtherCharges] = useState('')
  const [deficit, setDeficit] = useState('')
  useEffect(() => {
    if (!vehicles || !stats) return
    setIsRows(tracked.filter(v => perVehicle[v.id]?.sold && v.date_sell && new Date(v.date_sell).getFullYear() === year)
      .map(v => ({ key: `v${v.id}`, label: vehicleLabel(v), sell: v.price_sell ?? '', buy: v.price_buy ?? '', costs: Math.round(((perVehicle[v.id]?.charges || 0) + (perVehicle[v.id]?.works || 0)) * 100) / 100 })))
  }, [vehicles, stats, year]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (settings && deficit === '') setDeficit(settings.is_deficit_carryforward || '0') }, [settings]) // eslint-disable-line react-hooks/exhaustive-deps

  const caHT = isRows.reduce((a, r) => a + num(r.sell) - vatOnMargin(r.sell, r.buy), 0)
  const costOfCars = isRows.reduce((a, r) => a + num(r.buy), 0)
  const carCosts = isRows.reduce((a, r) => a + num(r.costs), 0)
  const before = caHT - costOfCars - carCosts - num(otherCharges)
  const taxable = Math.max(0, before - num(deficit))
  const is = Math.min(taxable, 42500) * 0.15 + Math.max(0, taxable - 42500) * 0.25

  const loading = !vehicles || !stats

  return (
    <Layout title="Simulateur">
      <div className="page-header">
        <div>
          <h1 className="page-title">Simulateur</h1>
          <p className="page-subtitle">Estimez une déclaration avant de la faire. Modifiez les montants ou ajoutez une vente « et si… » : rien n'est enregistré.</p>
        </div>
      </div>
      <div className="page-body">
        <AdminTabs />
        <div className="search-filter-bar" style={{ alignItems: 'center' }}>
          <div className="segmented">
            <button className={`segmented-btn${mode === 'tva' ? ' active' : ''}`} onClick={() => setMode('tva')}>TVA du mois</button>
            <button className={`segmented-btn${mode === 'is' ? ' active' : ''}`} onClick={() => setMode('is')}>Impôt sur les sociétés</button>
          </div>
          {mode === 'tva' && (
            <select className="filter-select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          <select className="filter-select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[0, 1].map(i => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {loading && <div className="loading-spinner"><div className="spinner" /></div>}

        {!loading && mode === 'tva' && (
          <div className="sim-grid">
            <div className="card" style={{ padding: 20 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Ventes de {MONTHS[month - 1].toLowerCase()} {year}</div>
              <SalesTable rows={tvaRows} setRows={setTvaRows} stock={stock} />
              <div className="form-grid-2" style={{ marginTop: 18 }}>
                <div className="form-group"><label className="form-label">TVA déductible du mois (€)</label>
                  <Money value={deductible} onChange={setDeductible} placeholder="0" />
                  <span className="form-hint">TVA indiquée sur les factures au nom de NEBAUTO (garage, pièces, CT…).</span></div>
                <div className="form-group"><label className="form-label">Crédit du mois précédent (€)</label>
                  <Money value={credit} onChange={setCredit} placeholder="0" />
                  <span className="form-hint">Ligne 27 de la déclaration précédente, s'il y en a un.</span></div>
              </div>
            </div>
            <div className="card sim-result">
              <div className="card-title">Résultat estimé</div>
              <Line label="TVA sur les marges" value={collected} hint="(prix de vente − prix d'achat) × 20/120, marge négative = 0" />
              <Line label="TVA déductible" value={num(deductible)} sign="− " />
              <Line label="Crédit reporté" value={num(credit)} sign="− " />
              <Line strong label={net >= 0 ? 'TVA à payer' : 'Crédit de TVA'} value={Math.abs(net)} />
              <p className="sim-note"><Info size={13} /> Les frais et le transport Auto1 (Allemagne) s'annulent : TVA déclarée et déduite du même montant.</p>
            </div>
          </div>
        )}

        {!loading && mode === 'is' && (
          <div className="sim-grid">
            <div className="card" style={{ padding: 20 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Ventes {year}</div>
              <SalesTable rows={isRows} setRows={setIsRows} stock={stock} showCosts />
              <div className="form-grid-2" style={{ marginTop: 18 }}>
                <div className="form-group"><label className="form-label">Autres charges de l'année (€)</label>
                  <Money value={otherCharges} onChange={setOtherCharges} placeholder="0" />
                  <span className="form-hint">Assurance, banque, comptable, téléphone… non rattachés à un véhicule.</span></div>
                <div className="form-group"><label className="form-label">Déficit des années précédentes (€)</label>
                  <Money value={deficit} onChange={setDeficit} placeholder="0" /></div>
              </div>
            </div>
            <div className="card sim-result">
              <div className="card-title">Résultat estimé</div>
              <Line label="Chiffre d'affaires HT" value={caHT} hint="ventes − TVA sur marge" />
              <Line label="Prix d'achat des véhicules vendus" value={costOfCars} sign="− " />
              <Line label="Frais des véhicules vendus" value={carCosts} sign="− " />
              <Line label="Autres charges" value={num(otherCharges)} sign="− " />
              <Line strong label={before >= 0 ? 'Bénéfice' : 'Perte'} value={Math.abs(before)} />
              <Line label="Déficit reporté" value={Math.min(num(deficit), Math.max(0, before))} sign="− " />
              <Line label="Bénéfice imposable" value={taxable} />
              <Line strong label="Impôt sur les sociétés" value={is} hint="15 % jusqu'à 42 500 €, 25 % au-delà" />
              <p className="sim-note"><Info size={13} /> {is > 3000 ? "Au-dessus de 3 000 € d'IS, des acomptes trimestriels seront dus l'an prochain." : "En dessous de 3 000 € d'IS, pas d'acomptes l'an prochain."} Les véhicules en stock ne comptent pas : leur coût sera déduit l'année de leur vente.</p>
            </div>
          </div>
        )}
        <p className="form-hint" style={{ marginTop: 16 }}>Estimation indicative à partir des données saisies sur le site. Elle ne remplace pas la déclaration officielle ni l'avis d'un expert-comptable.</p>
      </div>
    </Layout>
  )
}
