import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import * as XLSX from 'xlsx'
import useSWR, { useSWRConfig } from 'swr'
import Layout from '../../components/Layout'
import InterventionForm from '../../components/InterventionForm'
import PartnersWidget from '../../components/PartnersWidget'
import { fmt, fmtDate, fmtDays, vehicleLabel } from '../../lib/format'
import { ArrowUpRight, Plus, Wrench, X, TrendingUp } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { API_URL } from '../../lib/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)


const fetcher = (url) => fetch(url).then(r => r.json())

function KpiCard({ title, value, trend, onOpen, primary }) {
  return (
    <div className={`kpi-card${primary ? ' primary' : ''}`} onClick={onOpen} style={{ cursor: 'pointer' }}>
      <div className="kpi-card-header">
        <div className="kpi-title">{title}</div>
        <span className="kpi-icon-wrapper" style={{ background: 'transparent', border: 'none', padding: 0 }}>
          <ArrowUpRight size={16} color={primary ? 'var(--accent-primary)' : 'var(--text-primary)'} />
        </span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-trend" style={primary ? undefined : { color: 'var(--text-secondary)' }}>{trend}</div>
    </div>
  )
}
const CURRENT_YEAR = new Date().getFullYear()

export default function Dashboard() {
  const router = useRouter()
  const { data: stats, error: statsError } = useSWR(`${API_URL}/stats`, fetcher, { refreshInterval: 30000 })
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)
  const { data: charges } = useSWR(`${API_URL}/charges`, fetcher)
  const { data: interventions = [] } = useSWR(`${API_URL}/interventions`, fetcher)
  const { mutate } = useSWRConfig()

  const [activeModal, setActiveModal] = useState(null) // 'ventes' | 'achats' | 'charges' | 'profit' | 'intervention' | null
  const [chartYear, setChartYear] = useState(CURRENT_YEAR)

  const handleAddIntervention = async (payload) => {
    const res = await fetch(`${API_URL}/interventions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, status: 'à prévoir' }),
    })
    if (!res.ok) throw new Error('Failed to create intervention')
    mutate(`${API_URL}/interventions`)
    setActiveModal(null)
  }

  const fileInputRef = useRef(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json(worksheet)

      // Colonnes Excel attendues : Marque, Modèle, Immatriculation, Prix Achat, Prix Vente, Statut
      let importedCount = 0
      for (const row of json) {
        const payload = {
          brand: row['Marque'] || row['brand'] || 'Inconnu',
          model: row['Modèle'] || row['model'] || 'Inconnu',
          registration: row['Immatriculation'] || row['registration'] || null,
          price_buy: row['Prix Achat'] || row['price_buy'] ? parseFloat(row['Prix Achat'] || row['price_buy']) : null,
          price_sell: row['Prix Vente'] || row['price_sell'] ? parseFloat(row['Prix Vente'] || row['price_sell']) : null,
          status: row['Statut'] || row['status'] || 'en stock',
        }
        await fetch(`${API_URL}/vehicles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        importedCount++
      }

      mutate(`${API_URL}/vehicles`)
      mutate(`${API_URL}/stats`)
    } catch (err) {
      console.error(err)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Années disponibles pour le graphique, dérivées des dates d'achat/vente réelles
  const availableYears = useMemo(() => {
    const years = new Set([CURRENT_YEAR])
    vehicles?.forEach(v => {
      if (v.date_buy) years.add(new Date(v.date_buy).getFullYear())
      if (v.date_sell) years.add(new Date(v.date_sell).getFullYear())
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [vehicles])

  const chartData = useMemo(() => {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
    const achatsData = new Array(12).fill(0)
    const ventesData = new Array(12).fill(0)

    if (vehicles) {
      const excl = new Set(stats?.excluded_vehicle_ids || [])
      vehicles.filter(v => !excl.has(v.id)).forEach(v => {
        if (v.date_buy && v.price_buy) {
          const d = new Date(v.date_buy)
          if (d.getFullYear() === chartYear) achatsData[d.getMonth()] += v.price_buy
        }
        if (v.date_sell && v.price_sell) {
          const d = new Date(v.date_sell)
          if (d.getFullYear() === chartYear) ventesData[d.getMonth()] += v.price_sell
        }
      })
    }

    return {
      labels: months,
      datasets: [
        { label: 'Achats', data: achatsData, backgroundColor: '#e8f4ec', borderRadius: 4 },
        { label: 'Ventes', data: ventesData, backgroundColor: '#0d532a', borderRadius: 4 },
      ],
    }
  }, [vehicles, chartYear, stats])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, border: { display: false } },
      y: { display: false },
    },
  }

  if (statsError) return (
    <Layout title="Tableau de bord">
      <div className="empty-state">Erreur de connexion au backend.</div>
    </Layout>
  )

  if (!stats) return (
    <Layout title="Tableau de bord">
      <div className="loading-spinner"><div className="spinner" /> Chargement des données...</div>
    </Layout>
  )

  const profit = stats.total_profit ?? 0
  const isProfitNeg = profit < 0
  const bestVehicle = stats.top_vehicles?.[0]
  const bestVehicleInfo = bestVehicle ? vehicles?.find(v => v.id === bestVehicle.vehicle_id) : null

  const excluded = new Set(stats.excluded_vehicle_ids || [])
  const soldIds = new Set((stats.per_vehicle || []).filter(p => p.sold).map(p => p.vehicle_id))
  const vehOf = (id) => vehicles?.find(x => x.id === id)
  const groupOf = (vid) => (vid == null ? 'sold' : soldIds.has(vid) ? 'sold' : 'stock')
  const spent = (i) => i.status === 'annulée' ? 0 : i.cost_actual != null ? i.cost_actual : ['terminée', 'en cours'].includes(i.status) ? (i.cost_estimated || 0) : 0

  const renderTransactionsList = () => {
    let items = []
    const tracked = (vehicles || []).filter(v => !excluded.has(v.id))

    if (activeModal === 'ventes') {
      items = tracked.filter(v => soldIds.has(v.id))
        .sort((a, b) => new Date(b.date_sell) - new Date(a.date_sell))
        .map(v => ({ id: v.id, date: v.date_sell, vehicleName: `${v.brand} ${v.model}`, vehicleReg: v.registration, amount: v.price_sell, type: 'positive', group: 'sold' }))
    } else if (activeModal === 'achats') {
      items = tracked.filter(v => v.price_buy)
        .sort((a, b) => new Date(b.date_buy) - new Date(a.date_buy))
        .map(v => ({ id: v.id, date: v.date_buy, vehicleName: `${v.brand} ${v.model}`, vehicleReg: v.registration, amount: v.price_buy, type: 'negative', group: groupOf(v.id) }))
    } else if (activeModal === 'charges' && charges) {
      items = charges.filter(c => !excluded.has(c.vehicle_id))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map(c => {
          const v = vehOf(c.vehicle_id)
          return {
            id: c.id, date: c.date,
            title: v ? `${v.brand} ${v.model}` : (c.description || c.category),
            subtitle: v ? [c.category, c.description].filter(Boolean).join(' · ') : 'Charge générale',
            amount: c.amount, type: 'negative', group: groupOf(c.vehicle_id),
          }
        })
    } else if (activeModal === 'travaux' && interventions) {
      items = interventions
        .filter(i => !excluded.has(i.vehicle_id) && i.status !== 'annulée' && (i.cost_actual != null || i.cost_estimated != null))
        .sort((a, b) => new Date(b.date_planned) - new Date(a.date_planned))
        .map(i => {
          const v = vehOf(i.vehicle_id)
          const s = spent(i)
          return {
            id: i.id, date: i.date_planned,
            title: v ? `${v.brand} ${v.model}` : i.title,
            subtitle: `${i.title}${i.cost_actual == null ? ' (estimé)' : ''}`,
            amount: s || i.cost_estimated, type: 'negative',
            group: s ? groupOf(i.vehicle_id) : 'planned',
          }
        })
    } else if (activeModal === 'stock') {
      items = (stats.per_vehicle || []).filter(p => !p.sold).map(p => {
        const v = vehOf(p.vehicle_id)
        return {
          id: p.vehicle_id, vehicleName: v ? `${v.brand} ${v.model}` : 'Véhicule', vehicleReg: v?.registration,
          subtitle: `achat ${fmt(p.buy)} · charges ${fmt(p.charges)} · travaux ${fmt(p.works)}${p.planned ? ` · prévu ${fmt(p.planned)}` : ''}${p.target ? ` · visé ${fmt(p.target)}` : ''}`,
          amount: p.buy + p.charges + p.works, type: 'negative', group: 'stock',
        }
      })
    }

    if (items.length === 0) return <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Aucune transaction trouvée.</div>

    const GROUPS = [
      ['sold', 'Véhicules vendus — compté dans le profit'],
      ['stock', 'Véhicules en stock — argent immobilisé, récupéré à la vente'],
      ['planned', 'Prévu — pas encore dépensé, non compté'],
    ]
    return (
      <div className="transaction-list">
        {GROUPS.filter(([g]) => items.some(it => it.group === g)).map(([g, label]) => {
          const list = items.filter(it => it.group === g)
          const total = list.reduce((a, it) => a + (it.amount || 0), 0)
          return (
            <div key={g} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-secondary)', padding: '8px 0', borderBottom: '2px solid var(--border-color, #eaeaea)' }}>
                <span>{label}</span><span>{fmt(total)}</span>
              </div>
              {list.map((item, idx) => (
                <div key={idx} className="transaction-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid #eaeaea', opacity: g === 'planned' ? 0.6 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {item.vehicleName ? (
                        <>
                          <span>{item.vehicleName}</span>
                          {item.vehicleReg && <span style={{ color: '#1976d2', marginLeft: 8 }}>{item.vehicleReg}</span>}
                        </>
                      ) : item.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {[item.subtitle, item.date && fmtDate(item.date)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', color: item.type === 'positive' ? '#0d532a' : '#d32f2f' }}>
                    {item.type === 'positive' ? '+' : '-'}{fmt(item.amount)}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Layout title="Tableau de bord">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tableau de bord</h1>
          <p className="page-subtitle">Gérez et optimisez votre flotte automobile avec simplicité.</p>
        </div>
        <div>
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleImportExcel}
          />
          <button
            className="btn btn-outline"
            style={{ marginRight: '10px' }}
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? 'Importation...' : 'Importer Données'}
          </button>
          <Link href="/app/vehicles/new" className="btn btn-primary">
            <Plus size={16} /> Nouveau Véhicule
          </Link>
        </div>
      </div>

      {/* KPI Grid — les cartes s'additionnent : Profit = Ventes − Achats − Charges − Travaux (véhicules vendus) */}
      <div className="kpi-grid kpi-grid-3">
        <KpiCard primary title="Profit Net Global" value={fmt(profit)} onOpen={() => setActiveModal('profit')}
          trend={<><span className="kpi-trend-badge">{isProfitNeg ? '-' : '+'} Réalisé</span>{stats.count_sold} véhicule(s) vendu(s)</>} />
        <KpiCard title="Total Ventes" value={fmt(stats.total_sell ?? 0)} onOpen={() => setActiveModal('ventes')}
          trend="Véhicules vendus uniquement" />
        <KpiCard title="Achats" value={fmt(stats.total_buy ?? 0)} onOpen={() => setActiveModal('achats')}
          trend={`des véhicules vendus · + ${fmt(stats.stock_buy)} en stock`} />
        <KpiCard title="Charges" value={fmt(stats.total_charges ?? 0)} onOpen={() => setActiveModal('charges')}
          trend={`des véhicules vendus · + ${fmt(stats.stock_charges)} en stock`} />
        <KpiCard title="Travaux" value={fmt(stats.total_interventions ?? 0)} onOpen={() => setActiveModal('travaux')}
          trend={`des véhicules vendus · + ${fmt(stats.stock_interventions)} en stock`} />
        <KpiCard title="Argent en stock" value={fmt(stats.stock_invested ?? 0)} onOpen={() => setActiveModal('stock')}
          trend={`${stats.stock_count} véhicule(s) · prix visé ${fmt(stats.stock_target)}`} />
      </div>

      <div className="dashboard-grid-2">
        {/* Main Chart */}
        <div className="widget-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="widget-header">
            <div className="widget-title">Évolution Commerciale</div>
            <select
              className="filter-select"
              style={{ fontSize: 12, padding: '4px 10px' }}
              value={chartYear}
              onChange={e => setChartYear(parseInt(e.target.value))}
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minHeight: '220px', position: 'relative' }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Associés : qui achète / vend, investissements et commissions */}
        <PartnersWidget />
      </div>

      <div className="dashboard-grid-2">
        {/* Prochains entretiens (Tasks) */}
        <div className="widget-card">
          <div className="widget-header">
            <div className="widget-title">Prochains Entretiens</div>
            <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px' }} onClick={() => setActiveModal('intervention')}><Plus size={14} /> Ajouter</button>
          </div>

          <div className="task-list">
            {interventions.filter(i => new Date(i.date_planned) >= new Date() && i.status !== 'terminée').slice(0, 3).map((i, idx) => (
              <div key={idx} className="task-item">
                <div className="task-info">
                  <div className="task-icon"><Wrench size={20} color="var(--accent-primary)" /></div>
                  <div>
                    <div className="task-title">{i.title} - {vehicleLabel(vehicles?.find(v => v.id === i.vehicle_id))}</div>
                    <div className="task-date">Prévu le : {fmtDate(i.date_planned)}</div>
                  </div>
                </div>
                <span className={`badge ${i.status === 'en cours' ? 'badge-in-progress' : 'badge-todo'}`}>{i.status === 'en cours' ? 'En Cours' : 'À Faire'}</span>
              </div>
            ))}
            {interventions.filter(i => new Date(i.date_planned) >= new Date() && i.status !== 'terminée').length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Aucun entretien prévu.</p>
            )}
          </div>
        </div>

        {/* Performance flotte — indicateurs réellement calculés côté serveur */}
        <div className="widget-card">
          <div className="widget-header">
            <div className="widget-title">Performance Flotte</div>
            <TrendingUp size={16} color="var(--text-muted)" />
          </div>
          <div>
            <div className="mini-stat-row">
              <span className="mini-stat-label">Marge moyenne / véhicule vendu</span>
              <span className={`mini-stat-value ${stats.avg_profit >= 0 ? 'positive' : 'negative'}`}>{fmt(stats.avg_profit)}</span>
            </div>
            <div className="mini-stat-row">
              <span className="mini-stat-label">Temps de rotation moyen</span>
              <span className="mini-stat-value">{fmtDays(stats.avg_duration_days)}</span>
            </div>
            <div className="mini-stat-row">
              <span className="mini-stat-label">Véhicules vendus</span>
              <span className="mini-stat-value">{stats.count_sold ?? 0} / {stats.count_vehicles ?? 0}</span>
            </div>
            {bestVehicleInfo && (
              <div className="mini-stat-row">
                <span className="mini-stat-label">Meilleure affaire</span>
                <span className="mini-stat-value positive">{bestVehicleInfo.brand} {bestVehicleInfo.model} · {fmt(bestVehicle.profit)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Modals */}
      {activeModal && activeModal !== 'intervention' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px', padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                {activeModal === 'ventes' && 'Détail des Ventes'}
                {activeModal === 'achats' && 'Détail des Achats'}
                {activeModal === 'charges' && 'Détail des Charges'}
                {activeModal === 'travaux' && 'Détail des Travaux'}
                {activeModal === 'profit' && 'Analyse du Profit'}
                {activeModal === 'stock' && 'Argent immobilisé en stock'}
              </h2>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {activeModal === 'profit' ? (
              <div>
                <div className="summary-box" style={{ marginBottom: 16 }}>
                  <div className="row"><span>Ventes</span><span>{fmt(stats.total_sell)}</span></div>
                  <div className="row"><span>− Achats des véhicules vendus</span><span>{fmt(stats.total_buy)}</span></div>
                  <div className="row"><span>− Charges</span><span>{fmt(stats.total_charges)}</span></div>
                  <div className="row"><span>− Travaux</span><span>{fmt(stats.total_interventions)}</span></div>
                  <div className="row"><b>= Profit net</b><b>{fmt(stats.total_profit)}</b></div>
                </div>
                {(stats.per_vehicle || []).filter(p => p.sold).sort((a, b) => b.profit - a.profit).map(p => {
                  const v = vehOf(p.vehicle_id)
                  return (
                    <div key={p.vehicle_id} className="mini-stat-row">
                      <span className="mini-stat-label">
                        <Link href={`/app/vehicles/${p.vehicle_id}`} className="doc-link-main">{v ? `${v.brand} ${v.model} ${v.registration || ''}` : 'Véhicule'}</Link>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(p.sell)} − {fmt(p.buy)} − {fmt(p.charges)} − {fmt(p.works)}</div>
                      </span>
                      <span className={`mini-stat-value ${p.profit >= 0 ? 'positive' : 'negative'}`}>{fmt(p.profit)}</span>
                    </div>
                  )
                })}
                <div style={{ height: 12 }} />
                <div className="mini-stat-row">
                  <span className="mini-stat-label">Marge moyenne / véhicule vendu</span>
                  <span className="mini-stat-value">{fmt(stats.avg_profit)}</span>
                </div>
                <div className="mini-stat-row">
                  <span className="mini-stat-label">Temps de rotation moyen</span>
                  <span className="mini-stat-value">{fmtDays(stats.avg_duration_days)}</span>
                </div>
                {stats.worst_vehicles?.[0] && (
                  <div className="mini-stat-row">
                    <span className="mini-stat-label">Pire affaire</span>
                    <span className="mini-stat-value negative">{fmt(stats.worst_vehicles[0].profit)}</span>
                  </div>
                )}
              </div>
            ) : (
              renderTransactionsList()
            )}
          </div>
        </div>
      )}

      {/* Intervention Modal */}
      {activeModal === 'intervention' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Nouvel Entretien</h2>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <InterventionForm
              vehicles={vehicles}
              showVehicleSelect
              onSubmit={handleAddIntervention}
              onCancel={() => setActiveModal(null)}
              submitLabel="Enregistrer"
            />
          </div>
        </div>
      )}
    </Layout>
  )
}
