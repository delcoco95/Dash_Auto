// Alerte sur la fiche véhicule : dépenses de ce véhicule sans justificatif (ex. DA 25 € sans facture).
import useSWR from 'swr'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import ProofRow from './ProofRow'
import FilePreviewModal from './FilePreviewModal'
import { API_URL } from '../lib/api'

const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json() })

export default function MissingProofs({ vehicleId, refreshKey }) {
  const { data, mutate } = useSWR(vehicleId ? [`${API_URL}/admin/justificatifs?vehicle_id=${vehicleId}`, refreshKey] : null, ([u]) => fetcher(u))
  const [preview, setPreview] = useState(null)
  const missing = (data?.items || []).filter(i => i.status === 'manquant')
  if (!missing.length) return null
  return (
    <div className="proof-alert">
      <div className="proof-alert-head"><AlertTriangle size={16} /> {missing.length} justificatif{missing.length > 1 ? 's' : ''} manquant{missing.length > 1 ? 's' : ''} pour ce véhicule</div>
      {missing.map(it => <ProofRow key={it.key} it={it} onChanged={mutate} onPreview={setPreview} hideVehicle />)}
      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
