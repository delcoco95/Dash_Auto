import Link from 'next/link'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { 
  LayoutDashboard, 
  Car, 
  Briefcase, 
  FileText, 
  Wrench, 
  Calendar,
  Search,
  Bell,
  CheckCircle2,
  LogOut
} from 'lucide-react'

const navLinks = [
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { href: '/app/vehicles',  icon: Car,             label: 'Flotte' },
  { href: '#',              icon: Briefcase,       label: 'Commercial' },
  { href: '/app/documents', icon: FileText,        label: 'Administratif' },
  { href: '#',              icon: Wrench,          label: 'Entretien' },
  { href: '#',              icon: Calendar,        label: 'Planning' },
]

export default function Layout({ children, title = 'Dash Auto' }) {
  const router = useRouter()

  const handleLogout = () => {
    // Supprimer le cookie côté client et rediriger
    document.cookie = 'dash_auto_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
    router.push('/login')
  }

  return (
    <>
      <Head>
        <title>{`${title} — Dash Auto`}</title>
      </Head>
      <div className="app-layout">
        
        {/* ── Sidebar ─────────────────────────────── */}
        <aside className="sidebar">
          <Link href="/app/dashboard" className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <CheckCircle2 size={20} strokeWidth={2.5} />
            </div>
            <div className="sidebar-logo-text">DashAuto</div>
          </Link>

          <div className="sidebar-section-label">MENU</div>
          <nav className="sidebar-nav">
            {navLinks.map(({ href, icon: Icon, label }) => {
              const isActive = href !== '#' && router.pathname.startsWith(href)
              return (
                <Link
                  key={label}
                  href={href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon"><Icon size={18} /></span>
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="sidebar-section-label" style={{ marginTop: '30px' }}>GÉNÉRAL</div>
          <nav className="sidebar-nav">
            <button 
              onClick={handleLogout} 
              className="sidebar-link" 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}
            >
              <span className="nav-icon"><LogOut size={18} /></span>
              <span>Déconnexion</span>
            </button>
          </nav>

        </aside>

        {/* ── Main Content ────────────────────────── */}
        <main className="main-content">
          <header className="topbar">
            <div className="search-bar-global">
              <Search size={18} color="var(--text-muted)" />
              <input type="text" placeholder="Rechercher un véhicule, un contrat..." />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '2px 6px', borderRadius: '4px' }}>
                ⌘ F
              </div>
            </div>

            <div className="topbar-actions">
              <button className="topbar-btn">
                <Bell size={18} />
              </button>
              
              <div className="topbar-profile">
                <div className="profile-info">
                  <span className="profile-name">Mon Compte</span>
                  <span className="profile-role">Gestionnaire</span>
                </div>
                <div className="profile-avatar">DA</div>
              </div>
            </div>
          </header>

          {children}
        </main>

      </div>
    </>
  )
}
