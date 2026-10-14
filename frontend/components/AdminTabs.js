import Link from 'next/link'
import { useRouter } from 'next/router'
import { FileText, Landmark } from 'lucide-react'

// Sous-navigation de l'onglet « Administratif » : Documents | Fiscalité.
const TABS = [
  { href: '/app/documents', label: 'Documents', icon: FileText },
  { href: '/app/documents/fiscalite', label: 'Fiscalité & déclarations', icon: Landmark },
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
