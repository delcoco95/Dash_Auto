import Link from 'next/link'
import Head from 'next/head'

export default function Home() {
  return (
    <>
      <Head>
        <title>Dash Auto — Gestion achat-revente véhicules</title>
        <meta name="description" content="Dashboard premium pour piloter votre activité d'achat-revente de véhicules. KPIs en temps réel, IA intégrée." />
      </Head>
      <div className="hero">
        <div className="hero-badge">
          🚀 v1.0 — Dashboard Premium
        </div>

        <h1 className="hero-title">
          Pilotez votre activité<br />
          <span className="gradient-text">achat-revente</span>
        </h1>

        <p className="hero-subtitle">
          Gérez votre parc automobile, suivez vos profits en temps réel
          et obtenez des recommandations IA pour maximiser votre rentabilité.
        </p>

        <div className="hero-actions">
          <Link href="/app/dashboard" className="btn btn-primary">
            📊 Ouvrir le Dashboard
          </Link>
          <Link href="/app/vehicles" className="btn btn-ghost">
            🚗 Voir les véhicules
          </Link>
        </div>

        <div className="hero-stats">
          <div style={{ textAlign: 'center' }}>
            <div className="hero-stat-value">KPIs</div>
            <div className="hero-stat-label">Temps réel</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="hero-stat-value">IA</div>
            <div className="hero-stat-label">Intégrée</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="hero-stat-value">100%</div>
            <div className="hero-stat-label">Vos données</div>
          </div>
        </div>
      </div>
    </>
  )
}
