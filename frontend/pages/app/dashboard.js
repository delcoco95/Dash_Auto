import { useState, useMemo } from 'react'
import useSWR from 'swr'
import Layout from '../../components/Layout'
import { ArrowUpRight, Plus, Users, LayoutList, Calendar as CalendarIcon, Car, Wrench, MoreHorizontal, Video, FileText, X } from 'lucide-react'
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function formatDate(dateString) {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('fr-FR')
}

export default function Dashboard() {
  const { data: stats, error: statsError } = useSWR(`${API_URL}/stats`, fetcher, { refreshInterval: 30000 })
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)
  const { data: charges } = useSWR(`${API_URL}/charges`, fetcher)

  const [activeModal, setActiveModal] = useState(null) // 'ventes' | 'achats' | 'charges' | 'profit' | null

  // Chart Logic (Monthly)
  const chartData = useMemo(() => {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
    const achatsData = new Array(12).fill(0)
    const ventesData = new Array(12).fill(0)

    const currentYear = new Date().getFullYear()

    if (vehicles) {
      vehicles.forEach(v => {
        if (v.date_buy && v.price_buy) {
          const d = new Date(v.date_buy)
          if (d.getFullYear() === currentYear) achatsData[d.getMonth()] += v.price_buy
        }
        if (v.date_sell && v.price_sell) {
          const d = new Date(v.date_sell)
          if (d.getFullYear() === currentYear) ventesData[d.getMonth()] += v.price_sell
        }
      })
    }

    return {
      labels: months,
      datasets: [
        {
          label: 'Achats',
          data: achatsData,
          backgroundColor: '#e8f4ec',
          borderRadius: 4,
        },
        {
          label: 'Ventes',
          data: ventesData,
          backgroundColor: '#0d532a',
          borderRadius: 4,
        }
      ]
    }
  }, [vehicles])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: { grid: { display: false }, border: { display: false } },
      y: { display: false }
    }
  }

  if (statsError) return (
    <Layout title="Tableau de bord">
      <div className="empty-state">Erreur de connexion au backend.</div>
    </Layout>
  )

  if (!stats) return (
    <Layout title="Tableau de bord">
      <div className="loading-spinner">Chargement des données...</div>
    </Layout>
  )

  const profit = stats.total_profit ?? 0
  const isProfitNeg = profit < 0

  // Helper for Modals
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
    }

    if (items.length === 0) return <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Aucune transaction trouvée.</div>

    return (
      <div className="transaction-list">
        {items.map((item, idx) => (
          <div key={idx} className="transaction-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #eaeaea' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{formatDate(item.date)}</div>
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
          <button className="btn btn-outline" style={{ marginRight: '10px' }}>
            Importer Données
          </button>
          <button className="btn btn-primary">
            <Plus size={16} /> Nouveau Véhicule
          </button>
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
            Sur l'année en cours
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
          <div className="kpi-trend">
            Voir les transactions détaillées
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-title">Total Achats</div>
            <button className="kpi-icon-wrapper" onClick={() => setActiveModal('achats')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <ArrowUpRight size={16} color="var(--text-primary)" />
            </button>
          </div>
          <div className="kpi-value">{fmt(stats.total_buy ?? 0)}</div>
          <div className="kpi-trend">
            Voir les transactions détaillées
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-title">Total Charges</div>
            <button className="kpi-icon-wrapper" onClick={() => setActiveModal('charges')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <ArrowUpRight size={16} color="var(--text-primary)" />
            </button>
          </div>
          <div className="kpi-value">{fmt(stats.total_charges ?? 0)}</div>
          <div className="kpi-trend" style={{ color: 'var(--text-secondary)' }}>
            Voir les transactions détaillées
          </div>
        </div>
      </div>

      <div className="dashboard-grid-2">
        {/* Main Chart */}
        <div className="widget-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="widget-header">
            <div className="widget-title">Évolution Commerciale ({new Date().getFullYear()})</div>
          </div>
          <div style={{ flex: 1, minHeight: '220px', position: 'relative' }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Planning */}
        <div className="widget-card">
          <div className="widget-header">
            <div className="widget-title">Planning</div>
            <button className="kpi-icon-wrapper" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <ArrowUpRight size={16} color="var(--text-primary)" />
            </button>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>Visite - Peugeot 3008</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Aujourd'hui à 14:30</p>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }}>
            <CalendarIcon size={16} /> Ouvrir le calendrier complet
          </button>
        </div>
      </div>

      <div className="dashboard-grid-2">
        {/* Prochains entretiens (Tasks) */}
        <div className="widget-card">
          <div className="widget-header">
            <div className="widget-title">Prochains Entretiens</div>
            <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px' }}><Plus size={14}/> Ajouter</button>
          </div>
          
          <div className="task-list">
            <div className="task-item">
              <div className="task-info">
                <div className="task-icon"><Wrench size={20} color="var(--accent-primary)"/></div>
                <div>
                  <div className="task-title">Vidange Complète - Renault Clio 4</div>
                  <div className="task-date">Prévu le : 26 Nov, 2026</div>
                </div>
              </div>
              <span className="badge badge-todo">À Faire</span>
            </div>
          </div>
        </div>

        {/* Performance flotte */}
        <div className="widget-card">
          <div className="widget-header">
            <div className="widget-title">Performance Flotte</div>
          </div>
          <div style={{ textAlign: 'center', margin: '30px 0' }}>
            <div style={{ 
              width: '160px', 
              height: '160px', 
              borderRadius: '50%', 
              border: '16px solid var(--accent-primary)',
              borderRightColor: 'var(--bg-main)',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column'
            }}>
              <span style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {vehicles ? `+${Math.round(vehicles.length * 0.1)}%` : '0%'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Croissance</span>
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
              Comparé à l'année précédente
            </div>
          </div>
        </div>
      </div>

      {/* KPI Modals */}
      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: '500px', borderRadius: '12px', padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                {activeModal === 'ventes' && 'Détail des Ventes'}
                {activeModal === 'achats' && 'Détail des Achats'}
                {activeModal === 'charges' && 'Détail des Charges'}
                {activeModal === 'profit' && 'Analyse du Profit (À venir)'}
              </h2>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            {activeModal === 'profit' ? (
              <p style={{ color: '#666' }}>L'analyse détaillée du profit sera bientôt disponible (vue par véhicule, marge, etc.).</p>
            ) : (
              renderTransactionsList()
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
