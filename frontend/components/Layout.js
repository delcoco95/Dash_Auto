import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import { Toaster, toast } from 'react-hot-toast'
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
  LogOut,
  Menu,
  X
} from 'lucide-react'

const navLinks = [
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { href: '/app/vehicles',  icon: Car,             label: 'Flotte' },
  { href: '/app/documents', icon: FileText,        label: 'Administratif' },
]

export default function Layout({ children, title = 'Dash Auto' }) {
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Close sidebar on route change for mobile
  useEffect(() => {
    const handleRouteChange = () => setIsSidebarOpen(false)
    router.events.on('routeChangeComplete', handleRouteChange)
    return () => router.events.off('routeChangeComplete', handleRouteChange)
  }, [router.events])

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      
      // Supprimer le cookie côté client au cas où l'ancienne méthode était utilisée
      document.cookie = 'dash_auto_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
      toast.success('Déconnexion réussie')
      router.push('/login')
    } catch (error) {
      console.error('Erreur déconnexion:', error)
      toast.error('Erreur lors de la déconnexion')
    }
  }

  return (
    <>
      <Head>
        <title>{`${title} — Dash Auto`}</title>
      </Head>
      <Toaster position="top-right" />
      <div className="app-layout">
        
        {/* Overlay for mobile sidebar */}
        {isSidebarOpen && (
          <div 
            className="sidebar-overlay" 
            onClick={() => setIsSidebarOpen(false)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }}
          />
        )}

        {/* ── Sidebar ─────────────────────────────── */}
        <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px' }}>
            <Link href="/app/dashboard" className="sidebar-logo" style={{ marginBottom: 0 }}>
              <div className="sidebar-logo-icon">
                <CheckCircle2 size={20} strokeWidth={2.5} />
              </div>
              <div className="sidebar-logo-text">DashAuto</div>
            </Link>
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(false)} style={{ background: 'var(--bg-main)', borderRadius: '8px' }}>
              <X size={20} />
            </button>
          </div>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
              <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
                <Menu size={24} />
              </button>
              <div className="search-bar-global">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Rechercher un véhicule, un contrat..." />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '2px 6px', borderRadius: '4px' }}>
                  ⌘ F
                </div>
              </div>
            </div>
          </header>

          {children}
        </main>

      </div>
    </>
  )
}
