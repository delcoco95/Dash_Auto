import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import ChatBubble from './ChatBubble'

const navLinks = [
  { href: '/app/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/app/vehicles',  icon: '🚗', label: 'Véhicules' },
  { href: '/app/documents', icon: '📎', label: 'Documents' },
  { href: '/app/ai',        icon: '🤖', label: 'Assistant IA' },
]

export default function Layout({ children, title = 'Dash Auto' }) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <Head>
        <title>{`${title} — Dash Auto`}</title>
        <meta name="description" content="Dashboard de gestion achat-revente véhicules" />
      </Head>
      <div className="app-layout">

        {/* ── Overlay mobile ──────────────────────── */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              zIndex: 150, backdropFilter: 'blur(2px)',
            }}
          />
        )}

        {/* ── Sidebar ─────────────────────────────── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <Link href="/" className="sidebar-logo" onClick={() => setSidebarOpen(false)}>
            <div className="sidebar-logo-icon">🚘</div>
            <div className="sidebar-logo-text">
              Dash<span>Auto</span>
            </div>
          </Link>

          <div className="sidebar-section">
            <div className="sidebar-section-label">Navigation</div>
            <nav className="sidebar-nav">
              {navLinks.map(({ href, icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`sidebar-link ${router.pathname.startsWith(href) ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="nav-icon">{icon}</span>
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Sidebar footer — user info */}
          <div className="sidebar-footer">
            <div className="sidebar-avatar">DA</div>
            <div className="sidebar-footer-info">
              <div className="sidebar-footer-name">Mon Compte</div>
              <div className="sidebar-footer-role">Gestionnaire</div>
            </div>
          </div>
        </aside>

        {/* ── Main ────────────────────────────────── */}
        <main className="main-content">

          {/* Topbar */}
          <header className="topbar">
            {/* Hamburger (mobile) */}
            <button
              className="topbar-icon-btn"
              onClick={() => setSidebarOpen(s => !s)}
              aria-label="Menu"
              style={{ display: 'none' }}
              id="hamburger-btn"
            >
              ☰
            </button>

            <div className="topbar-title">
              {title}
            </div>

            <div className="topbar-actions">
              <div className="topbar-avatar" title="Mon compte">
                DA
              </div>
            </div>
          </header>

          {children}
        </main>

        <ChatBubble />
      </div>

      {/* Hamburger CSS visibility */}
      <style jsx global>{`
        @media (max-width: 900px) {
          #hamburger-btn { display: flex !important; }
        }
      `}</style>
    </>
  )
}
