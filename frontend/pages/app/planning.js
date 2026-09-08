import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import format from 'date-fns/format'
import parse from 'date-fns/parse'
import startOfWeek from 'date-fns/startOfWeek'
import getDay from 'date-fns/getDay'
import frLocale from 'date-fns/locale/fr'
import { Plus, Trash, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Layout from '../../components/Layout'
import { fmtDateTime } from '../../lib/format'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

const locales = { fr: frLocale }
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })

const messages = {
  allDay: 'Toute la journée', previous: 'Précédent', next: 'Suivant', today: "Aujourd'hui",
  month: 'Mois', week: 'Semaine', day: 'Jour', agenda: 'Agenda', date: 'Date', time: 'Heure',
  event: 'Événement', noEventsInRange: 'Aucun événement dans cette période.',
}

const EVENT_COLORS = { 'rendez-vous': '#0d532a', location: '#1976d2', autre: '#e67700' }
const EVENT_LABELS = { 'rendez-vous': 'Rendez-vous', location: 'Location', autre: 'Autre' }

function emptyForm() {
  return { title: '', type: 'rendez-vous', vehicle_id: '', start_time: '', end_time: '', description: '' }
}

function toLocalIso(date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16)
}

export default function Planning() {
  const { data: events = [] } = useSWR(`${API_URL}/events`, fetcher)
  const { data: vehicles } = useSWR(`${API_URL}/vehicles`, fetcher)
  const { mutate } = useSWRConfig()

  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState(emptyForm())

  const calendarEvents = events.map(e => ({ ...e, start: new Date(e.start_time), end: new Date(e.end_time) }))
  const upcoming = events
    .filter(e => new Date(e.start_time) >= new Date())
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .slice(0, 8)

  const handleSelectSlot = ({ start, end }) => {
    setSelectedEvent(null)
    setFormData({ ...emptyForm(), start_time: toLocalIso(start), end_time: toLocalIso(end) })
    setShowForm(true)
  }

  const handleSelectEvent = (event) => {
    setSelectedEvent(event)
    setFormData({
      title: event.title,
      type: event.type || 'rendez-vous',
      vehicle_id: event.vehicle_id || '',
      start_time: toLocalIso(new Date(event.start_time)),
      end_time: toLocalIso(new Date(event.end_time)),
      description: event.description || '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      title: formData.title,
      type: formData.type,
      start_time: new Date(formData.start_time).toISOString(),
      end_time: new Date(formData.end_time).toISOString(),
      description: formData.description,
      vehicle_id: formData.vehicle_id ? parseInt(formData.vehicle_id) : null,
    }
    try {
      const res = await fetch(`${API_URL}/events${selectedEvent ? `/${selectedEvent.id}` : ''}`, {
        method: selectedEvent ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      mutate(`${API_URL}/events`)
      toast.success(selectedEvent ? 'Événement mis à jour' : 'Événement ajouté')
      setShowForm(false)
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    }
  }

  const handleDelete = async () => {
    if (!selectedEvent) return
    if (!confirm('Voulez-vous vraiment supprimer cet événement ?')) return
    try {
      const res = await fetch(`${API_URL}/events/${selectedEvent.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      mutate(`${API_URL}/events`)
      toast.success('Événement supprimé')
      setShowForm(false)
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <Layout title="Planning">
      <div className="page-header">
        <div>
          <h1 className="page-title">Planning</h1>
          <p className="page-subtitle">Rendez-vous, locations et échéances — vue complète, plus besoin de repasser par le tableau de bord.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setSelectedEvent(null); setFormData(emptyForm()); setShowForm(true) }}>
          <Plus size={16} /> Nouvel événement
        </button>
      </div>

      <div className="page-body">
        <div className="planning-legend" style={{ marginBottom: 16 }}>
          {Object.entries(EVENT_LABELS).map(([key, label]) => (
            <span key={key}>
              <span className="planning-legend-dot" style={{ background: EVENT_COLORS[key] }} />
              {label}
            </span>
          ))}
        </div>

        <div className="planning-layout">
          <div className="planning-calendar-card">
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              culture="fr"
              messages={messages}
              selectable
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              style={{ flex: 1 }}
              eventPropGetter={(event) => ({
                style: { backgroundColor: EVENT_COLORS[event.type] || EVENT_COLORS['rendez-vous'], borderRadius: 4, border: 'none', fontSize: 12 },
              })}
            />
          </div>

          <div className="planning-sidebar">
            {showForm ? (
              <div className="event-panel-overlay">
                <div className="event-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>{selectedEvent ? 'Modifier événement' : 'Nouvel événement'}</h3>
                    <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
                  </div>
                  <form onSubmit={handleSubmit}>
                    <div className="form-group">
                      <label className="form-label required">Titre</label>
                      <input required type="text" className="form-input" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Ex: Visite client" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Type</label>
                      <select className="form-input" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                        {Object.entries(EVENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Véhicule (optionnel)</label>
                      <select className="form-input" value={formData.vehicle_id} onChange={e => setFormData({ ...formData, vehicle_id: e.target.value })}>
                        <option value="">Aucun</option>
                        {vehicles?.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.registration})</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Début</label>
                      <input required type="datetime-local" className="form-input" value={formData.start_time} onChange={e => setFormData({ ...formData, start_time: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Fin</label>
                      <input required type="datetime-local" className="form-input" value={formData.end_time} onChange={e => setFormData({ ...formData, end_time: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Description</label>
                      <textarea className="form-input" rows="3" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Enregistrer</button>
                      {selectedEvent && (
                        <button type="button" className="btn btn-danger" onClick={handleDelete}><Trash size={16} /></button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="widget-card">
                <div className="widget-header"><div className="widget-title">Prochains événements</div></div>
                {upcoming.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun événement à venir.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {upcoming.map(e => {
                    const d = new Date(e.start_time)
                    return (
                      <div key={e.id} className="upcoming-event" onClick={() => handleSelectEvent(e)} style={{ cursor: 'pointer' }}>
                        <div className="upcoming-event-date">
                          <span className="day">{d.getDate()}</span>
                          <span className="month">{d.toLocaleDateString('fr-FR', { month: 'short' })}</span>
                        </div>
                        <div className="upcoming-event-info">
                          <div className="upcoming-event-title">{e.title}</div>
                          <div className="upcoming-event-time">{fmtDateTime(e.start_time)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
