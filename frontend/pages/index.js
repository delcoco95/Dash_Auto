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
        <div className="hero-content">
          <div className="hero-badge">
            <span>🚀</span> v1.0 — Dashboard Premium
          </div>

          <h1 className="hero-title">
            Pilotez votre activité<br />
            <span className="gradient-text">achat-revente</span>
          </h1>

          <p className="hero-subtitle">
            Gérez votre parc automobile, suivez vos profits en temps réel
            et obtenez des recommandations IA pour maximiser votre rentabilité.
          </p>

          <div className="hero-cta">
            <Link href="/app/dashboard" className="btn btn-primary">
              📊 Ouvrir le Dashboard
            </Link>
            <Link href="/app/vehicles" className="btn btn-ghost">
              🚗 Voir les véhicules
            </Link>
          </div>

          <div className="hero-features">
            <div className="hero-feature">
              <span>📈</span> KPIs en temps réel
            </div>
            <div className="hero-feature">
              <span>🤖</span> IA intégrée
            </div>
            <div className="hero-feature">
              <span>🔒</span> Vos données privées
            </div>
            <div className="hero-feature">
              <span>📱</span> 100% responsive
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
