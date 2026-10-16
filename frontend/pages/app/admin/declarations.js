/**
 * Suivi des déclarations : à déposer → déposée (à payer) → déposée et payée.
 * Aucun calcul de TVA ici : on note seulement ce qui a été fait.
 */
import { useState } from 'react'
import useSWR from 'swr'
import Layout from '../../../components/Layout'
import AdminTabs from '../../../components/AdminTabs'
import { EditModal, DeclRow } from '../../../components/Declarations'
import { API_URL } from '../../../lib/api'
import { Plus, ExternalLink } from 'lucide-react'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })

export default function Declarations() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [filter, setFilter] = useState('')
  const [edit, setEdit] = useState(null)
  const { data, error, mutate } = useSWR(`${API_URL}/admin/declarations?year=${year}`, fetcher)

  const rows = [...(data || [])].reverse().filter(d => !filter || (filter === 'todo' ? ['à déposer', 'en retard'].includes(d.state) : d.state === filter))
  const count = (s) => (data || []).filter(d => (Array.isArray(s) ? s.includes(d.state) : d.state === s)).length

  return (
    <Layout title="Déclarations">
      <div className="page-header">
        <div>
          <h1 className="page-title">Déclarations</h1>
          <p className="page-subtitle">Ce qui est déposé, payé, ou encore à faire. Les déclarations se font sur votre espace professionnel impots.gouv.fr.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn btn-outline" href="https://cfspro.impots.gouv.fr/" target="_blank" rel="noreferrer">impots.gouv <ExternalLink size={14} /></a>
          <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={16} /> Ajouter</button>
        </div>
      </div>
      <div className="page-body">
        <AdminTabs />
        {error && <div className="empty-state">Erreur de connexion au backend.</div>}
        {!data && !error && <div className="loading-spinner"><div className="spinner" /></div>}
        {data && (
          <>
            <div className="search-filter-bar" style={{ alignItems: 'center' }}>
              <select className="filter-select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
                {[0, 1, 2].map(i => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="segmented">
                {[['', `Toutes (${data.length})`], ['todo', `À déposer (${count(['à déposer', 'en retard'])})`], ['à payer', `À payer (${count('à payer')})`], ['terminée', `Terminées (${count('terminée')})`]].map(([k, l]) => (
                  <button key={k} className={`segmented-btn${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: 0 }}>
              {rows.length === 0 && <div className="empty-state">Rien ici.</div>}
              {rows.map(d => <DeclRow key={d.key} d={d} onEdit={setEdit} onChanged={mutate} />)}
            </div>
          </>
        )}
      </div>
      {edit && <EditModal decl={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); mutate() }} />}
    </Layout>
  )
}
