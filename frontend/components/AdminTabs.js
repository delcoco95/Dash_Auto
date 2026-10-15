import Link from 'next/link'
import { useRouter } from 'next/router'
import { LayoutGrid, Receipt, ListChecks, FileText } from 'lucide-react'

// Sous-navigation de l'onglet « Administratif ».
const TABS = [
  { href: '/app/admin', label: "Vue d'ensemble", icon: LayoutGrid },
  { href: '/app/documents/fiscalite', label: 'Déclarations TVA', icon: Receipt },
  { href: '/app/admin/justificatifs', label: 'Justificatifs', icon: ListChecks },
  { href: '/app/documents', label: 'Documents', icon: FileText },
]

export default function AdminTabs() {
  const { pathname } = useRouter()
  return (
    <div className="tab-bar" style={{ marginBottom: 20 }}>
      {TABS.map(t => {
        const Icon = t.icon
        const active = pathname === t.href
        return (
          <Link key={t.href} href={t.href} className={`tab-btn${active ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
            <Icon size={16} /> {t.label}
          </Link>
        )
      })}
    </div>
  )
}
