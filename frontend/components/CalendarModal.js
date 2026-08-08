import { useState } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import format from 'date-fns/format'
import parse from 'date-fns/parse'
import startOfWeek from 'date-fns/startOfWeek'
import getDay from 'date-fns/getDay'
import frLocale from 'date-fns/locale/fr'
import { X, Trash } from 'lucide-react'
import toast from 'react-hot-toast'

const locales = {
  'fr': frLocale,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

const messages = {
  allDay: 'Toute la journée',
  previous: 'Précédent',
  next: 'Suivant',
  today: "Aujourd'hui",
  month: 'Mois',
  week: 'Semaine',
  day: 'Jour',
  agenda: 'Agenda',
  date: 'Date',
  time: 'Heure',
  event: 'Événement',
  noEventsInRange: "Aucun événement dans cette période.",
}

export default function CalendarModal({ events, vehicles, onClose, onAddEvent, onUpdateEvent, onDeleteEvent }) {
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showEventForm, setShowEventForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    type: 'rendez-vous',
    vehicle_id: '',
    start_time: '',
    end_time: '',
    description: ''
  })

  // Convert API events to react-big-calendar format
  const calendarEvents = events.map(e => ({
    ...e,
    start: new Date(e.start_time),
    end: new Date(e.end_time),
  }))

  const handleSelectSlot = ({ start, end }) => {
    // Format for datetime-local input
    const toLocalIso = (date) => {
      const offset = date.getTimezoneOffset()
      const local = new Date(date.getTime() - (offset*60*1000))
      return local.toISOString().slice(0,16)
    }

    setFormData({
      title: '',
      type: 'rendez-vous',
      vehicle_id: '',
      start_time: toLocalIso(start),
      end_time: toLocalIso(end),
      description: ''
    })
    setSelectedEvent(null)
    setShowEventForm(true)
  }

  const handleSelectEvent = (event) => {
    const toLocalIso = (date) => {
      const offset = date.getTimezoneOffset()
      const local = new Date(date.getTime() - (offset*60*1000))
      return local.toISOString().slice(0,16)
    }

    setSelectedEvent(event)
    setFormData({
      title: event.title,
      type: event.type || 'rendez-vous',
      vehicle_id: event.vehicle_id || '',
      start_time: toLocalIso(new Date(event.start_time)),
      end_time: toLocalIso(new Date(event.end_time)),
      description: event.description || ''
    })
    setShowEventForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Convert local datetime to UTC for API
    const payload = {
      title: formData.title,
      type: formData.type,
      start_time: new Date(formData.start_time).toISOString(),
      end_time: new Date(formData.end_time).toISOString(),
      description: formData.description,
      vehicle_id: formData.vehicle_id ? parseInt(formData.vehicle_id) : null
    }

    try {
      if (selectedEvent) {
        await onUpdateEvent(selectedEvent.id, payload)
        toast.success("Événement mis à jour")
      } else {
        await onAddEvent(payload)
        toast.success("Événement ajouté")
      }
      setShowEventForm(false)
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde")
    }
  }

  const handleDelete = async () => {
    if (!selectedEvent) return
    if (confirm("Voulez-vous vraiment supprimer cet événement ?")) {
      try {
        await onDeleteEvent(selectedEvent.id)
        toast.success("Événement supprimé")
        setShowEventForm(false)
      } catch (err) {
        toast.error("Erreur lors de la suppression")
      }
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '90%', maxWidth: '1000px', borderRadius: '12px', padding: '24px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Planning Interactif</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
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
            style={{ height: '100%' }}
            eventPropGetter={(event) => {
              let bg = '#0d532a'
              if (event.type === 'location') bg = '#1976d2'
              return { style: { backgroundColor: bg, borderRadius: 4, border: 'none', fontSize: 12 } }
            }}
          />
        </div>

        {/* Side Panel for Event Form */}
        {showEventForm && (
          <div style={{
            position: 'absolute', top: 24, right: 24, bottom: 24, width: 350, 
            background: '#fff', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            padding: 20, display: 'flex', flexDirection: 'column', zIndex: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{selectedEvent ? 'Modifier événement' : 'Nouvel événement'}</h3>
              <button onClick={() => setShowEventForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16}/></button>
            </div>

            <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
              <div className="form-group">
                <label className="form-label">Titre</label>
                <input required type="text" className="form-input" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ex: Visite client" />
              </div>

              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                  <option value="rendez-vous">Rendez-vous</option>
                  <option value="location">Location</option>
                  <option value="autre">Autre</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Véhicule (Optionnel)</label>
                <select className="form-input" value={formData.vehicle_id} onChange={e => setFormData({...formData, vehicle_id: e.target.value})}>
                  <option value="">Aucun</option>
                  {vehicles && vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.registration})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Début</label>
                <input required type="datetime-local" className="form-input" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Fin</label>
                <input required type="datetime-local" className="form-input" value={formData.end_time} onChange={e => setFormData({...formData, end_time: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows="3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Enregistrer</button>
                {selectedEvent && (
                  <button type="button" className="btn btn-outline" style={{ color: '#d32f2f', borderColor: '#d32f2f' }} onClick={handleDelete}>
                    <Trash size={16} />
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}
