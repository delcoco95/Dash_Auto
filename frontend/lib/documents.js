// Logique partagée pour les documents administratifs (statuts, expiration, icônes).
import { FileImage, FileSpreadsheet, FileText, File as FileGeneric } from 'lucide-react'

export function isExpiring(expDate, docStatus) {
  if (docStatus === 'archivé') return false
  if (!expDate) return false
  const diffDays = (new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24)
  return diffDays < 30 && diffDays >= 0
}

export function isExpired(expDate, docStatus) {
  if (docStatus === 'archivé') return false
  if (!expDate) return false
  return new Date(expDate) < new Date()
}

// Compte les documents en alerte (expirés ou expirant sous 30 jours) dans une liste.
export function countDocAlerts(docs) {
  if (!docs) return 0
  return docs.filter(d => isExpired(d.expiration_date, d.status) || isExpiring(d.expiration_date, d.status)).length
}

export function getDocIcon(type) {
  if (!type) return FileGeneric
  if (type.startsWith('image/')) return FileImage
  if (type.includes('excel') || type.includes('sheet') || type.includes('xls') || type.includes('csv')) return FileSpreadsheet
  if (type.includes('pdf') || type.includes('word') || type.includes('doc')) return FileText
  return FileGeneric
}

// Classe de badge propre au vocabulaire documentaire — jamais celui des statuts véhicule.
export function docStatusBadgeClass(status) {
  switch (status) {
    case 'valide': return 'badge-doc-valide'
    case 'expiré': return 'badge-doc-expire'
    case 'en attente': return 'badge-doc-attente'
    case 'archivé': return 'badge-doc-archive'
    default: return 'badge-doc-attente'
  }
}
