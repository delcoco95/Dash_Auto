// Libellés et explications des cases de la déclaration de TVA 3310-CA3,
// utilisés par la page Fiscalité pour guider la saisie sur impots.gouv.fr.

export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export const ENTRY_KINDS = {
  achat_vehicule_marge: 'Achat véhicule (régime de la marge)',
  service_ue: 'Prestation UE — TVA autoliquidée',
  achat_fr_tva: 'Achat France avec TVA déductible',
  immobilisation: 'Immobilisation (outillage, matériel…)',
  sans_tva: 'Dépense sans TVA',
}

export const ENTRY_KIND_HELP = {
  achat_vehicule_marge: "Prix du véhicule seul (facture « TVA sur marge »), sans les frais. Sert à calculer la marge à la revente. Pas de TVA déductible.",
  service_ue: "Facture HT d'un prestataire de l'UE (frais de service / transport AUTO1 Berlin). La TVA est déclarée ET déduite (opération neutre) — obligatoire de la déclarer.",
  achat_fr_tva: "Facture française avec TVA (pièces, garage, contrôle technique…). TVA déductible uniquement si la facture est au nom de la société et conservée.",
  immobilisation: "Matériel durable (outillage, ordinateur…). TVA déductible en ligne 19.",
  sans_tva: "Commission, achat à un particulier, frais administratifs, assurance… N'entre pas dans la TVA, mais compte pour l'IS.",
}

// Cases affichées dans le récapitulatif CA3, dans l'ordre du formulaire.
export const CA3_CASES = [
  { code: 'A1', key: 'A1', label: 'Ventes, prestations de services', help: 'Total des MARGES hors taxe des véhicules vendus dans le mois.' },
  { code: 'A3', key: 'A3', label: "Achats de prestations auprès d'un assujetti non établi en France", help: 'Frais de service et transports AUTO1 Berlin facturés HT (autoliquidation).' },
  { code: 'E2', key: 'E2', label: 'Autres opérations non imposables', help: "Partie du prix de vente qui n'est pas de la marge (≈ prix d'achat du véhicule). À confirmer avec la notice de la CA3 / votre SIE." },
  { code: '08', key: '08_base', taxKey: '08_tax', label: 'Taux normal 20 % — base HT / taxe due', help: 'Base = A1 + A3. Taxe = TVA sur marge + TVA autoliquidée.' },
  { code: '16', key: '16', label: 'Total de la TVA brute due', help: 'Calculé automatiquement par le site impots.gouv.' },
  { code: '19', key: '19', label: 'TVA déductible — biens constituant des immobilisations', help: 'Matériel durable avec facture.' },
  { code: '20', key: '20', label: 'TVA déductible — autres biens et services', help: 'TVA autoliquidée (même montant que dans la ligne 08) + TVA des factures françaises en main.' },
  { code: '22', key: '22', label: 'Report du crédit de la déclaration précédente', help: 'Ligne 27 du mois précédent.' },
  { code: '23', key: '23', label: 'Total TVA déductible', help: 'Calculé automatiquement par le site.' },
  { code: 'TD', key: 'TD', label: 'TVA due', help: 'Ligne 16 − ligne 23 (si positif).' },
  { code: '25', key: '25', label: 'Crédit de TVA', help: 'Ligne 23 − ligne 16 (si positif). Reporté en ligne 27.' },
  { code: '27', key: '27', label: 'Crédit de TVA à reporter', help: 'À reporter ligne 22 le mois suivant.' },
  { code: '32', key: '32', label: 'Total à payer', help: 'Montant prélevé par télérèglement.' },
]

export function statusBadge(status) {
  switch (status) {
    case 'déposée':
    case 'payée':
      return 'badge-doc-valide'
    case 'non due':
    case 'non dû':
    case 'hors suivi':
      return 'badge-doc-archive'
    case 'en retard':
    case 'à rectifier':
      return 'badge-doc-expire'
    case 'en cours':
      return 'badge-todo'
    default:
      return 'badge-doc-attente'
  }
}

export function eur(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
}
