import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../../components/Layout'
import VehicleForm from '../../../components/VehicleForm'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function NewVehicle() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const handleSubmit = async (data) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Erreur lors de la création')
      }
      const vehicle = await res.json()
      router.push(`/app/vehicles/${vehicle.id}`)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <Layout title="Ajouter un véhicule">
      <div className="page-header">
        <h1 className="page-title">🚗 Ajouter un véhicule</h1>
        <p className="page-subtitle">Renseignez les informations du véhicule</p>
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
        <div className="card">
          <div className="card-body">
            <VehicleForm
              onSubmit={handleSubmit}
              loading={loading}
              submitLabel="✓ Créer le véhicule"
            />
          </div>
        </div>
      </div>
    </Layout>
  )
}
