import useSWR from 'swr'
import Layout from '../../components/Layout'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

const kpiConfig = [
  { key: 'total_buy',     label: 'Total Achats',  icon: '🛒', color: '#6c63ff' },
  { key: 'total_sell',    label: 'Total Ventes',  icon: '💰', color: '#00d4aa' },
  { key: 'total_charges', label: 'Total Charges', icon: '🔧', color: '#f5a623' },
  { key: 'total_profit',  label: 'Profit Net',    icon: '📈', color: '#ff4d6d', isProfit: true },
]

export default function Dashboard() {
  const { data, error } = useSWR(`${API_URL}/stats`, fetcher, { refreshInterval: 30000 })

  if (error) return (
    <Layout title="Dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>
      <div className="page-body">
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              ⚠️ Impossible de contacter le backend — vérifiez que <code>localhost:8000</code> est démarré.
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )

  if (!data) return (
    <Layout title="Dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>
      <div className="page-body">
        <div className="loading-spinner">
          <div className="spinner" /> Chargement des données...
        </div>
      </div>
    </Layout>
  )

  const profit = data.total_profit ?? 0
  const maxProfit = data.top_vehicles?.length
    ? Math.max(...data.top_vehicles.map(v => Math.abs(v.profit || 0)), 1)
    : 1

  return (
    <Layout title="Dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Vue d'ensemble de votre activité</p>
      </div>

      <div className="page-body">
        {/* KPI Cards */}
        <div className="kpi-grid">
          {kpiConfig.map(({ key, label, icon, color, isProfit }, i) => {
            const val = data[key] ?? 0
            const isNeg = isProfit && val < 0
            return (
              <div
                key={key}
                className={`kpi-card fade-in-up fade-in-up-${i + 1}`}
                style={{ '--kpi-color': color }}
              >
                <span className="kpi-icon">{icon}</span>
                <div className="kpi-label">{label}</div>
                <div className={`kpi-value ${isProfit ? (isNeg ? 'negative' : 'positive') : ''}`}>
                  {fmt(val)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Top Véhicules */}
        <div className="card fade-in-up fade-in-up-4" style={{ maxWidth: 680 }}>
          <div className="card-header">
            <span className="card-title">🏆 Top Véhicules par Profit</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {data.top_vehicles?.length ?? 0} véhicule(s)
            </span>
          </div>
          <div className="card-body">
            {data.top_vehicles?.length ? (
              data.top_vehicles.map((t, idx) => (
                <div className="top-vehicle-item" key={t.vehicle_id}>
                  <div className="top-vehicle-rank">#{idx + 1}</div>
                  <div className="top-vehicle-info">
                    <div className="top-vehicle-name">
                      {t.brand ? `${t.brand} ${t.model || ''}`.trim() : `Véhicule #${t.vehicle_id}`}
                    </div>
                  </div>
                  <div className="progress-bar-track">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${Math.max(4, (Math.abs(t.profit || 0) / maxProfit) * 100)}%` }}
                    />
                  </div>
                  <div className="top-vehicle-profit">
                    {fmt(t.profit)}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">Aucun véhicule vendu pour l'instant.</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
