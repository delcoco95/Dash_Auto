import useSWR from 'swr'
import Layout from '../../components/Layout'
import { ArrowUpRight, Plus, Users, LayoutList, Calendar as CalendarIcon, Car, Wrench, MoreHorizontal, Video, FileText } from 'lucide-react'
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

export default function Dashboard() {
  const { data, error } = useSWR(`${API_URL}/stats`, fetcher, { refreshInterval: 30000 })

  // Static Data for the mock widgets
  const chartData = {
    labels: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    datasets: [
      {
        label: 'Achats',
        data: [12000, 19000, 3000, 5000, 20000, 30000, 45000],
        backgroundColor: '#e8f4ec',
        borderRadius: 8,
      },
      {
        label: 'Ventes',
        data: [15000, 25000, 10000, 8000, 24000, 38000, 50000],
        backgroundColor: '#0d532a',
        borderRadius: 8,
      }
    ]
  }

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

  if (error) return (
    <Layout title="Tableau de bord">
      <div className="empty-state">Erreur de connexion au backend.</div>
    </Layout>
  )

  if (!data) return (
    <Layout title="Tableau de bord">
      <div className="loading-spinner">Chargement des données...</div>
    </Layout>
  )

  const profit = data.total_profit ?? 0
  const isProfitNeg = profit < 0

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
            <div className="kpi-icon-wrapper"><ArrowUpRight size={16} /></div>
          </div>
          <div className="kpi-value">{fmt(profit)}</div>
          <div className="kpi-trend">
            <span className="kpi-trend-badge">{isProfitNeg ? '-' : '+'} 12%</span>
            Depuis le mois dernier
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-title">Total Ventes</div>
            <div className="kpi-icon-wrapper"><ArrowUpRight size={16} color="var(--text-primary)" /></div>
          </div>
          <div className="kpi-value">{fmt(data.total_sell ?? 0)}</div>
          <div className="kpi-trend">
            <span className="kpi-trend-badge">+ 8%</span>
            Depuis le mois dernier
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-title">Total Achats</div>
            <div className="kpi-icon-wrapper"><ArrowUpRight size={16} color="var(--text-primary)" /></div>
          </div>
          <div className="kpi-value">{fmt(data.total_buy ?? 0)}</div>
          <div className="kpi-trend">
            <span className="kpi-trend-badge">+ 5%</span>
            Depuis le mois dernier
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-title">Total Charges</div>
            <div className="kpi-icon-wrapper"><ArrowUpRight size={16} color="var(--text-primary)" /></div>
          </div>
          <div className="kpi-value">{fmt(data.total_charges ?? 0)}</div>
          <div className="kpi-trend" style={{ color: 'var(--text-secondary)' }}>
            À surveiller
          </div>
        </div>
      </div>

      <div className="dashboard-grid-2">
        {/* Main Chart */}
        <div className="widget-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="widget-header">
            <div className="widget-title">Évolution Commerciale (Semaine)</div>
            <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '12px' }}>Voir plus</button>
          </div>
          <div style={{ flex: 1, minHeight: '220px', position: 'relative' }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Planning / Reminder */}
        <div className="widget-card">
          <div className="widget-header">
            <div className="widget-title">Rendez-vous Client</div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>Visite - Peugeot 3008</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Heure : 14:00 - 15:30</p>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }}>
            <Video size={16} /> Lancer la Visio
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

            <div className="task-item">
              <div className="task-info">
                <div className="task-icon"><Car size={20} color="var(--accent-primary)"/></div>
                <div>
                  <div className="task-title">Contrôle Technique - VW Golf 8</div>
                  <div className="task-date">Prévu le : 28 Nov, 2026</div>
                </div>
              </div>
              <span className="badge badge-in-progress">En Cours</span>
            </div>

            <div className="task-item">
              <div className="task-info">
                <div className="task-icon"><FileText size={20} color="var(--accent-primary)"/></div>
                <div>
                  <div className="task-title">Récupération Carte Grise - Audi A3</div>
                  <div className="task-date">Prévu le : 30 Nov, 2026</div>
                </div>
              </div>
              <span className="badge badge-done">Terminé</span>
            </div>
          </div>
        </div>

        {/* Project Progress (Top Vehicles Mocked as Progress) */}
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
              <span style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)' }}>75%</span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rentabilité</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-primary)' }}></div> Haute</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bg-main)' }}></div> Basse</div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
