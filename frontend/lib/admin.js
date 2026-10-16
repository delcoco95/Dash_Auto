import { API_URL } from './api'

// Libellés partagés de l'onglet Administratif (suivi simple, sans calcul de TVA).
export const STATE_BADGE = {
  'en retard': 'badge-doc-expire',
  'à déposer': 'badge-doc-attente',
  'à payer': 'badge-todo',
  'terminée': 'badge-doc-valide',
  'non due': 'badge-doc-archive',
}
export const STATE_LABEL = {
  'en retard': 'En retard',
  'à déposer': 'À déposer',
  'à payer': 'Déposée · à payer',
  'terminée': 'Déposée et payée',
  'non due': 'Non due',
}
export const KINDS = [
  ['CA3', 'TVA (CA3)'], ['IS_ACOMPTE', 'Acompte IS (2571)'], ['IS_SOLDE', 'Solde IS (2572)'],
  ['IS_RESULTAT', 'Liasse fiscale (2065)'], ['CFE', 'CFE'], ['CVAE', 'CVAE (1329)'], ['AUTRE', 'Autre'],
]
export const PROOF_KIND = { achat: 'Achat véhicule', vente: 'Vente', charge: 'Charge', travaux: 'Travaux' }
export const DOC_CATEGORY = { achat: 'Facture', vente: 'DV - Vente', charge: 'Facture', travaux: 'Facture' }

export async function setProof(key, body) {
  const res = await fetch(`${API_URL}/admin/justificatifs/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Échec de la mise à jour')
  return res.json()
}
