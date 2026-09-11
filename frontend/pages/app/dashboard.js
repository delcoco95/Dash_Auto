import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import * as XLSX from 'xlsx'
import useSWR, { useSWRConfig } from 'swr'
import Layout from '../../components/Layout'
import InterventionForm from '../../components/InterventionForm'
import { fmt, fmtDate, fmtDays } from '../../lib/format'
import { ArrowUpRight, Plus, Calendar as CalendarIcon, Wrench, X, TrendingUp } from 'lucide-react'
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

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())
const CURRENT_YEAR = new Date().getFullYear()

export default function Dashboard() {
  const router = useRouter()
  const { data: stats, error: statsError } = useSWR(`${API_URL}/stats`, fetcher, { refreshInterval: 30000 })
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)
  const { data: charges } = useSWR(`${API_URL}/charges`, fetcher)
  const { data: events = [] } = useSWR(`${API_URL}/events`, fetcher)
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
      vehicles.forEach(v => {
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
  }, [vehicles, chartYear])

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

  const renderTransactionsList = () => {
    let items = []

    if (activeModal === 'ventes' && vehicles) {
      items = vehicles.filter(v => v.price_sell && v.date_sell)
        .sort((a, b) => new Date(b.date_sell) - new Date(a.date_sell))
        .map(v => ({ id: v.id, date: v.date_sell, title: `${v.brand} ${v.model}`, amount: v.price_sell, type: 'positive' }))
    } else if (activeModal === 'achats' && vehicles) {
      items = vehicles.filter(v => v.price_buy && v.date_buy)
        .sort((a, b) => new Date(b.date_buy) - new Date(a.date_buy))
        .map(v => ({ id: v.id, date: v.date_buy, title: `${v.brand} ${v.model}`, amount: v.price_buy, type: 'negative' }))
    } else if (activeModal === 'charges' && charges) {
      items = charges
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map(c => ({ id: c.id, date: c.date, title: c.description || c.category, amount: c.amount, type: 'negative' }))
    } else if (activeModal === 'travaux' && interventions) {
      items = interventions
        .filter(i => i.status !== 'annulée' && (i.cost_actual != null || i.cost_estimated != null))
        .sort((a, b) => new Date(b.date_planned) - new Date(a.date_planned))
        .map(i => ({
          id: i.id,
          date: i.date_planned,
          title: `${i.title}${i.cost_actual == null ? ' (estimé)' : ''}`,
          amount: i.cost_actual ?? i.cost_estimated,
          type: 'negative',
        }))
    }

    if (items.length === 0) return <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Aucune transaction trouvée.</div>

    return (
      <div className="transaction-list">
        {items.map((item, idx) => (
          <div key={idx} className="transaction-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #eaeaea' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{fmtDate(item.date)}</div>
            </div>
            <div style={{ fontWeight: 600, color: item.type === 'positive' ? '#0d532a' : '#d32f2f' }}>
              {item.type === 'positive' ? '+' : '-'}{fmt(item.amount)}
            </div>
          </div>
        ))}
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

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi-card primary">
          <div className="kpi-card-header">
            <div className="kpi-title">Profit Net Global</div>
            <button className="kpi-icon-wrapper" onClick={() => setActiveModal('profit')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <ArrowUpRight size={16} color="var(--accent-primary)" />
            </button>
          </div>
          <div className="kpi-value">{fmt(profit)}</div>
          <div className="kpi-trend">
            <span className="kpi-trend-badge">{isProfitNeg ? '-' : '+'} Actuel</span>
            Vente - achat - charges - travaux
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-title">Total Ventes</div>
            <button className="kpi-icon-wrapper" onClick={() => setActiveModal('ventes')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <ArrowUpRight size={16} color="var(--text-primary)" />
            </button>
          </div>
          <div className="kpi-value">{fmt(stats.total_sell ?? 0)}</div>
          <div className="kpi-trend">Voir les transactions détaillées</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-title">Total Achats</div>
            <button className="kpi-icon-wrapper" onClick={() => setActiveModal('achats')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <ArrowUpRight size={16} color="var(--text-primary)" />
            </button>
          </div>
          <div className="kpi-value">{fmt(stats.total_buy ?? 0)}</div>
          <div className="kpi-trend">Voir les transactions détaillées</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-title">Total Charges</div>
            <button className="kpi-icon-wrapper" onClick={() => setActiveModal('charges')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <ArrowUpRight size={16} color="var(--text-primary)" />
            </button>
          </div>
          <div className="kpi-value">{fmt(stats.total_charges ?? 0)}</div>
          <div className="kpi-trend" style={{ color: 'var(--text-secondary)' }}>Voir les transactions détaillées</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-title">Total Travaux</div>
            <button className="kpi-icon-wrapper" onClick={() => setActiveModal('travaux')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <ArrowUpRight size={16} color="var(--text-primary)" />
            </button>
          </div>
          <div className="kpi-value">{fmt(stats.total_interventions ?? 0)}</div>
          <div className="kpi-trend" style={{ color: 'var(--text-secondary)' }}>Voir les transactions détaillées</div>
        </div>
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

        {/* Planning */}
        <div className="widget-card">
          <div className="widget-header">
            <div className="widget-title">Planning</div>
            <Link href="/app/planning" className="kpi-icon-wrapper" style={{ background: 'transparent', border: 'none' }}>
              <ArrowUpRight size={16} color="var(--text-primary)" />
            </Link>
          </div>
          <div style={{ marginBottom: '16px', flex: 1 }}>
            {events.filter(e => new Date(e.start_time) >= new Date()).slice(0, 2).map((e, idx) => (
              <div key={idx} style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '2px', color: 'var(--text-primary)' }}>{e.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                  {fmtDate(e.start_time)} à {new Date(e.start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
            {events.filter(e => new Date(e.start_time) >= new Date()).length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Aucun événement à venir.</p>
            )}
          </div>
          <Link href="/app/planning" className="btn btn-primary" style={{ width: '100%' }}>
            <CalendarIcon size={16} /> Ouvrir le planning complet
          </Link>
        </div>
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
                    <div className="task-title">{i.title} - {vehicles?.find(v => v.id === i.vehicle_id)?.brand || 'Véhicule Inconnu'}</div>
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
              </h2>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {activeModal === 'profit' ? (
              <div>
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
