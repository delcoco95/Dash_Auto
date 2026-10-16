import Link from 'next/link'
import { useRouter } from 'next/router'
import { LayoutGrid, Receipt, Calculator, ListChecks, FileText } from 'lucide-react'

// Sous-navigation de l'onglet « Administratif ».
const TABS = [
  { href: '/app/admin', label: "Vue d'ensemble", icon: LayoutGrid },
  { href: '/app/admin/declarations', label: 'Déclarations', icon: Receipt },
  { href: '/app/admin/simulateur', label: 'Simulateur', icon: Calculator },
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
