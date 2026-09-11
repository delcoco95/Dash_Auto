import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Head from 'next/head'
import useSWR from 'swr'
import { supabase } from '../lib/supabase'
import { Toaster, toast } from 'react-hot-toast'
import { countDocAlerts } from '../lib/documents'
import {
  LayoutDashboard,
  Car,
  FileText,
  Calendar,
  Search,
  Bot,
  CheckCircle2,
  LogOut,
  Menu,
  X
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const fetcher = (url) => fetch(url).then(r => r.json())

const navLinks = [
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { href: '/app/vehicles',  icon: Car,             label: 'Flotte' },
  { href: '/app/planning',  icon: Calendar,        label: 'Planning' },
  { href: '/app/documents', icon: FileText,        label: 'Administratif' },
  { href: '/app/ai',        icon: Bot,             label: 'Assistant IA' },
]

export default function Layout({ children, title = 'Dash Auto' }) {
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef(null)
  const inputRef = useRef(null)

  const { data: docs } = useSWR(`${API_URL}/documents`, fetcher, { refreshInterval: 60000 })
  const docAlertCount = countDocAlerts(docs)

  const params = new URLSearchParams()
  if (query.trim().length >= 2) params.set('search', query.trim())
  const { data: results } = useSWR(query.trim().length >= 2 ? `${API_URL}/vehicles?${params}` : null, fetcher)

  // Close sidebar on route change for mobile
  useEffect(() => {
    const handleRouteChange = () => { setIsSidebarOpen(false); setShowResults(false); setQuery('') }
    router.events.on('routeChangeComplete', handleRouteChange)
    return () => router.events.off('routeChangeComplete', handleRouteChange)
  }, [router.events])

  // Raccourci clavier Ctrl/Cmd+F pour atteindre la recherche globale
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f'
      if (isShortcut) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') setShowResults(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Ferme le dropdown au clic extérieur
  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const submitSearch = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    router.push(`/app/vehicles?search=${encodeURIComponent(query.trim())}`)
    setShowResults(false)
  }

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
                  {href === '/app/documents' && docAlertCount > 0 && (
                    <span className="nav-badge" title={`${docAlertCount} document(s) à surveiller`}>{docAlertCount}</span>
                  )}
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
              <form className="search-bar-global" ref={searchRef} onSubmit={submitSearch}>
                <Search size={18} className="search-icon" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Rechercher un véhicule..."
                  value={query}
                  onChange={e => { setQuery(e.target.value); setShowResults(true) }}
                  onFocus={() => query && setShowResults(true)}
                />
                <div className="search-shortcut-badge" style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '2px 6px', borderRadius: '4px' }}>
                  ⌘ F
                </div>

                {showResults && query.trim().length >= 2 && (
                  <div className="search-results">
                    {!results && <div className="search-result-empty">Recherche...</div>}
                    {results?.length === 0 && <div className="search-result-empty">Aucun véhicule trouvé pour « {query} ».</div>}
                    {results?.slice(0, 6).map(v => (
                      <div
                        key={v.id}
                        className="search-result-item"
                        onClick={() => { router.push(`/app/vehicles/${v.id}`); setShowResults(false); setQuery('') }}
                      >
                        <Car size={14} color="var(--text-muted)" />
                        <span style={{ fontWeight: 600 }}>{v.brand} {v.model}</span>
                        {v.registration && <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{v.registration}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </div>
          </header>

          {children}
        </main>

      </div>
    </>
  )
}
