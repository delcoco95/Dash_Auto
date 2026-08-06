import { useState } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import Link from 'next/link'
import Layout from '../../../../components/Layout'
import VehicleForm from '../../../../components/VehicleForm'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

export default function EditVehicle() {
  const router = useRouter()
  const { id } = router.query
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const [saved,  setSaved]  = useState(false)

  const { data: vehicle } = useSWR(id ? `${API_URL}/vehicles/${id}` : null, fetcher)

  const handleSubmit = async (data) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/vehicles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Erreur lors de la mise à jour')
      }
      setSaved(true)
      setTimeout(() => router.push(`/app/vehicles/${id}`), 800)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  if (!vehicle) return (
    <Layout title="Modification">
      <div className="page-header"><h1 className="page-title">Chargement...</h1></div>
      <div className="page-body"><div className="loading-spinner"><div className="spinner" /> Chargement...</div></div>
    </Layout>
  )

  const title = `${vehicle.brand} ${vehicle.model}`

  return (
    <Layout title={`Modifier — ${title}`}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Link href={`/app/vehicles/${id}`} style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            ← {title}
          </Link>
        </div>
        <h1 className="page-title">✏️ Modifier — {title}</h1>
        <p className="page-subtitle">Mettez à jour les informations du véhicule</p>
      </div>

      <div className="page-body">
        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(255,77,109,.1)',
            border: '1px solid rgba(255,77,109,.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            fontSize: 14,
            marginBottom: 20,
          }}>
            ⚠️ {error}
          </div>
        )}
        {saved && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(0,212,170,.1)',
            border: '1px solid rgba(0,212,170,.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--success)',
            fontSize: 14,
            marginBottom: 20,
          }}>
            ✓ Véhicule mis à jour ! Redirection...
          </div>
        )}
        <div className="card">
          <div className="card-body">
            <VehicleForm
              initialData={{
                ...vehicle,
                date_buy:           vehicle.date_buy  || '',
                date_sell:          vehicle.date_sell || '',
                date_last_service:  vehicle.date_last_service  || '',
                date_next_service:  vehicle.date_next_service  || '',
                date_last_ct:       vehicle.date_last_ct  || '',
                date_next_ct:       vehicle.date_next_ct  || '',
              }}
              onSubmit={handleSubmit}
              loading={saving}
              submitLabel="✓ Enregistrer les modifications"
            />
          </div>
        </div>
      </div>
    </Layout>
  )
}
