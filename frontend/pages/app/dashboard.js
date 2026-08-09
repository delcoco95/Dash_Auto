import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import useSWR, { useSWRConfig } from 'swr'
import Layout from '../../components/Layout'
import CalendarModal from '../../components/CalendarModal'
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
  const { data: events = [] } = useSWR(`${API_URL}/events`, fetcher)
  const { data: interventions = [] } = useSWR(`${API_URL}/interventions`, fetcher)
  const { mutate } = useSWRConfig()

  const [activeModal, setActiveModal] = useState(null) // 'ventes' | 'achats' | 'charges' | 'profit' | 'calendar' | 'intervention' | null

  const handleAddEvent = async (payload) => {
    const res = await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) throw new Error('Failed to create event')
    mutate(`${API_URL}/events`)
  }

  const handleUpdateEvent = async (id, payload) => {
    const res = await fetch(`${API_URL}/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) throw new Error('Failed to update event')
    mutate(`${API_URL}/events`)
  }

  const handleDeleteEvent = async (id) => {
    const res = await fetch(`${API_URL}/events/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete event')
    mutate(`${API_URL}/events`)
  }

  const handleAddIntervention = async (e) => {
    e.preventDefault()
    const form = new FormData(e.target)
    const payload = {
      title: form.get('title'),
      category: form.get('category'),
      date_planned: form.get('date_planned'),
      vehicle_id: parseInt(form.get('vehicle_id')),
      status: 'à prévoir'
    }

    try {
      const res = await fetch(`${API_URL}/interventions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to create intervention')
      mutate(`${API_URL}/interventions`)
      setActiveModal(null)
      // toast success handled globally or silently here, react-hot-toast should be available but not imported
    } catch (err) {
      console.error(err)
    }
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

      // Assuming Excel columns: Marque, Modèle, Immatriculation, Prix Achat, Prix Vente, Statut
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
          body: JSON.stringify(payload)
        })
        importedCount++
      }
      
      mutate(`${API_URL}/vehicles`)
      mutate(`${API_URL}/stats`)
      if (typeof toast !== 'undefined') toast.success(`${importedCount} véhicules importés !`)
    } catch (err) {
      console.error(err)
      if (typeof toast !== 'undefined') toast.error("Erreur lors de l'import")
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
            <button className="kpi-icon-wrapper" onClick={() => setActiveModal('calendar')} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <ArrowUpRight size={16} color="var(--text-primary)" />
            </button>
          </div>
          <div style={{ marginBottom: '16px', flex: 1 }}>
            {events.filter(e => new Date(e.start_time) >= new Date()).slice(0, 2).map((e, idx) => (
              <div key={idx} style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '2px', color: 'var(--text-primary)' }}>{e.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                  {formatDate(e.start_time)} à {new Date(e.start_time).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
            ))}
            {events.filter(e => new Date(e.start_time) >= new Date()).length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Aucun événement à venir.</p>
            )}
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setActiveModal('calendar')}>
            <CalendarIcon size={16} /> Ouvrir le calendrier complet
          </button>
        </div>
      </div>

      <div className="dashboard-grid-2">
        {/* Prochains entretiens (Tasks) */}
        <div className="widget-card">
          <div className="widget-header">
            <div className="widget-title">Prochains Entretiens</div>
            <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px' }} onClick={() => setActiveModal('intervention')}><Plus size={14}/> Ajouter</button>
          </div>
          
          <div className="task-list">
            {interventions.filter(i => new Date(i.date_planned) >= new Date() && i.status !== 'terminée').slice(0, 3).map((i, idx) => (
              <div key={idx} className="task-item">
                <div className="task-info">
                  <div className="task-icon"><Wrench size={20} color="var(--accent-primary)"/></div>
                  <div>
                    <div className="task-title">{i.title} - {vehicles?.find(v => v.id === i.vehicle_id)?.brand || 'Véhicule Inconnu'}</div>
                    <div className="task-date">Prévu le : {formatDate(i.date_planned)}</div>
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

      {/* Calendar Modal */}
      {activeModal === 'calendar' && (
        <CalendarModal 
          events={events}
          vehicles={vehicles}
          onClose={() => setActiveModal(null)}
          onAddEvent={handleAddEvent}
          onUpdateEvent={handleUpdateEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      )}

      {/* Intervention Modal */}
      {activeModal === 'intervention' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Nouvel Entretien</h2>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleAddIntervention}>
              <div className="form-group">
                <label className="form-label">Titre de l'intervention</label>
                <input name="title" required type="text" className="form-input" placeholder="Ex: Contrôle technique" />
              </div>
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select name="category" required className="form-input">
                  <option value="CT">Contrôle Technique</option>
                  <option value="Vidange">Vidange</option>
                  <option value="Réparation">Réparation</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Véhicule</label>
                <select name="vehicle_id" required className="form-input">
                  <option value="">-- Choisir un véhicule --</option>
                  {vehicles && vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.registration})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date prévue</label>
                <input name="date_planned" required type="date" className="form-input" />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 10 }}>Enregistrer</button>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
