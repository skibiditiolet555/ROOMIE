import { Link } from 'react-router-dom'
import {
  Upload,
  Wand2,
  PackageCheck,
  Wallet,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ChevronDown,
  Link2,
  AtSign,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Header from '../../components/Header/Header'
import heroRoom from '../../assets/hero-room.jpg'
import './LandingPage.css'

const features = [
  {
    icon: Wand2,
    title: 'AI Room Generation',
    text: 'Describe your dream room and watch AI bring it to life with photorealistic renders in seconds.',
  },
  {
    icon: RefreshCw,
    title: 'Furniture Swap',
    text: 'Click any piece to explore alternatives. Mix and match styles until your room feels just right.',
  },
  {
    icon: Wallet,
    title: 'Budget Control',
    text: 'Set your spending limit and track costs live as you customize every detail of your space.',
  },
]

const howItWorks = [
  { icon: Upload, title: 'Upload inspo' },
  { icon: Wand2, title: 'Ai design' },
  { icon: PackageCheck, title: 'Receive your dream room' },
]

export default function LandingPage() {
  const { user } = useAuth()
  const startPath = user ? '/home' : '/login'

  return (
    <div className="landing-page">
      <Header />

      {/* ── Hero ── */}
      <section className="landing-hero" id="hero">
        <div className="landing-hero__bg" style={{ backgroundImage: `url(${heroRoom})` }} />
        <div className="landing-hero__overlay" />

        <div className="landing-hero__content">

          <h1 className="landing-hero__title">
            Start build your DREAM
            <br />
            ROOMS in your budget
          </h1>
          <p className="landing-hero__caption">AI Interior Design Platform</p>

          <div className="landing-hero__actions">
            <Link to={startPath} className="site-header__cta">
              Start Designing
              <ArrowRight size={18} />
            </Link>
            <a href="#how-it-works" className="landing-hero__ghost-btn">
              See How It Works
            </a>
          </div>
        </div>

        <a href="#features" className="landing-hero__scroll-cue" aria-label="Scroll down">
          <ChevronDown size={22} />
        </a>
      </section>

      {/* ── Features ── */}
      <section className="landing-features" id="features">
        <div className="landing-features__header">
          <p className="landing-how__label">Features</p>
          <h2 className="landing-how__title">Everything you need to design</h2>
          <p className="landing-features__subtitle">
            Powerful tools that make interior design accessible to everyone, from first-time
            decorators to seasoned pros.
          </p>
        </div>

        <div className="landing-features__grid">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="feature-card">
                <div className="feature-card__icon">
                  <Icon size={22} />
                </div>
                <h3 className="feature-card__title">{feature.title}</h3>
                <p className="feature-card__text">{feature.text}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── How To Use ── */}
      <section className="landing-how" id="how-it-works">
        <div className="landing-how__bg" style={{ backgroundImage: `url(${heroRoom})` }} />
        <div className="landing-how__overlay" />

        <div className="landing-how__header">
          <p className="landing-how__label">How to use</p>
          <h2 className="landing-how__title">From your imagination to reality</h2>
        </div>

        <div className="landing-how__grid">
          {howItWorks.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="how-item">
                <div className="how-item__visual">
                  <span className="how-item__step">{i + 1}</span>
                  <Icon size={32} />
                </div>
                <h3 className="how-item__title">{step.title}</h3>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── CTA Band ── */}
      <section className="landing-cta">
        <div className="landing-cta__inner">
          <h2 className="landing-cta__title">Ready to design your dream room?</h2>
          <p className="landing-cta__text">Join Roomie free and get your first AI render in minutes.</p>
          <Link to={startPath} className="site-header__cta">
            Start Designing Free
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <div className="landing-footer__logo">Roomie</div>
            <p className="landing-footer__desc">
              AI-powered interior design that makes creating your dream space effortless and affordable.
            </p>
          </div>

          <div className="landing-footer__links">
            <div>
              <h4 className="landing-footer__col-title">Product</h4>
              <ul className="landing-footer__col-list">
                <li><a href="#features">Features</a></li>
                <li><a href="#how-it-works">How It Works</a></li>
                <li><a href="#hero">Home</a></li>
              </ul>
            </div>
            <div>
              <h4 className="landing-footer__col-title">Legal</h4>
              <ul className="landing-footer__col-list">
                <li><a href="#">Privacy</a></li>
                <li><a href="#">Terms</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="landing-footer__bottom">
          <p className="landing-footer__copy">&copy; 2026 Roomie. All rights reserved.</p>
          <div className="landing-footer__socials">
            <a href="#" className="landing-footer__social-link" aria-label="Website">
              <Link2 size={18} />
            </a>
            <a href="#" className="landing-footer__social-link" aria-label="Contact">
              <AtSign size={18} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
