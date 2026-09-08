// Formatage partagé — une seule règle par type de donnée, réutilisée sur tous les écrans.

export function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function fmtKm(km) {
  if (km == null) return '—'
  return new Intl.NumberFormat('fr-FR').format(km) + ' km'
}

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}

export function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtDays(n) {
  if (n == null) return '—'
  const days = Math.round(n)
  return `${days} jour${days > 1 ? 's' : ''}`
}
