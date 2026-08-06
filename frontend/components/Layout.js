import Link from 'next/link'
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

  return (
    <>
      <Head>
        <title>{`${title} — Dash Auto`}</title>
        <meta name="description" content="Dashboard de gestion achat-revente véhicules" />
      </Head>
      <div className="app-layout">
        {/* ── Sidebar ─────────────────────────────── */}
        <aside className="sidebar">
          <Link href="/" className="sidebar-logo">
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
                >
                  <span className="nav-icon">{icon}</span>
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div style={{ marginTop: 'auto', padding: '0 20px' }}>
            <div style={{
              padding: '12px',
              background: 'rgba(108,99,255,.08)',
              borderRadius: '10px',
              border: '1px solid rgba(108,99,255,.15)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}>
              <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>
                🟢 Backend connecté
              </div>
              localhost:8000
            </div>
          </div>
        </aside>

        {/* ── Main ────────────────────────────────── */}
        <main className="main-content">
          {children}
        </main>

        <ChatBubble />
      </div>
    </>
  )
}
