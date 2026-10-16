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
  CheckCircle2,
  LogOut,
  Menu,
  X,
  FileSignature,
  AlertTriangle
} from 'lucide-react'
import { API_URL } from '../lib/api'


const fetcher = (url) => fetch(url).then(r => r.json())

const navLinks = [
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { href: '/app/vehicles',  icon: Car,             label: 'Flotte' },
  { href: '/app/planning',  icon: Calendar,        label: 'Planning' },
  { href: '/app/admin', icon: FileText,        label: 'Administratif', match: ['/app/admin', '/app/documents'] },
  { href: '/app/pdf-generator', icon: FileSignature, label: 'Générateur PDF' },
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
  const { data: alerts } = useSWR(`${API_URL}/admin/alerts`, fetcher, { refreshInterval: 300000 })
  // Messages du bandeau : déclarations en retard / proches / à payer, puis justificatifs manquants
  const urgent = alerts && Array.isArray(alerts.late) ? [
    ...alerts.late.map(d => `${d.label} en retard`),
    ...alerts.due_soon.map(d => `${d.label} à déposer avant le ${new Date(d.due_date).toLocaleDateString('fr-FR')}`),
    ...alerts.unpaid.map(d => `${d.label} déposée mais pas payée`),
    ...(alerts.missing_proofs ? [`${alerts.missing_proofs} justificatif${alerts.missing_proofs > 1 ? 's' : ''} manquant${alerts.missing_proofs > 1 ? 's' : ''}`] : []),
  ] : []
  const urgentCount = urgent.length
  const [bannerHidden, setBannerHidden] = useState(false)

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

      // Le cookie de session est HttpOnly : il est effacé par le serveur.
      await fetch('/api/auth/logout', { method: 'POST' })
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
            {navLinks.map(({ href, icon: Icon, label, match }) => {
              const isActive = href !== '#' && (match || [href]).some(p => router.pathname.startsWith(p))
              return (
                <Link
                  key={label}
                  href={href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon"><Icon size={18} /></span>
                  <span>{label}</span>
                  {href === '/app/admin' && (docAlertCount + urgentCount) > 0 && (
                    <span className="nav-badge" title={`${urgentCount} alerte(s) administrative(s) et ${docAlertCount} document(s) à surveiller`}>{docAlertCount + urgentCount}</span>
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

          {urgentCount > 0 && !bannerHidden && !router.pathname.startsWith('/app/admin') && !router.pathname.startsWith('/app/documents') && (
            <div className="fiscal-banner" role="status">
              <AlertTriangle size={16} />
              <span>
                {urgent[0]}
                {urgentCount > 1 ? ` · ${urgent.slice(1, 3).join(' · ')}${urgentCount > 3 ? ` · +${urgentCount - 3}` : ''}` : ''}
              </span>
              <Link href="/app/admin" className="fiscal-banner-link">Voir</Link>
              <button className="fiscal-banner-close" onClick={() => setBannerHidden(true)} aria-label="Masquer"><X size={14} /></button>
            </div>
          )}

          {children}
        </main>

      </div>
    </>
  )
}
