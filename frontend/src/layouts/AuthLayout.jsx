import { Link, Outlet } from 'react-router-dom'
import { ArrowLeft, Sparkles, Wand2, Wallet, Heart } from 'lucide-react'
import heroRoom from '../assets/hero-room.jpg'
import './AuthLayout.css'

const perks = [
  { icon: Wand2, text: 'AI-generated room designs in seconds' },
  { icon: Wallet, text: 'Stay on budget with live cost tracking' },
  { icon: Heart, text: 'Save and revisit your favorite looks' },
]

export default function AuthLayout() {
  return (
    <div className="auth-layout">
      {/* Left: Decorative Side */}
      <div className="auth-layout__decor-side">
        <div className="auth-layout__decor-bg" style={{ backgroundImage: `url(${heroRoom})` }} />
        <div className="auth-layout__decor-overlay" />

        <Link to="/" className="auth-layout__back">
          <ArrowLeft size={16} />
          Back to home
        </Link>

        <div className="auth-layout__decor-content">
          <span className="auth-layout__badge">
            <Sparkles size={14} />
            AI Interior Design Platform
          </span>

          <h2 className="auth-layout__decor-title">Welcome back</h2>
          <p className="auth-layout__decor-text">
            Pick up right where you left off and keep building the room of your dreams.
          </p>

          <ul className="auth-layout__perks">
            {perks.map((perk) => {
              const Icon = perk.icon
              return (
                <li key={perk.text} className="auth-layout__perk">
                  <span className="auth-layout__perk-icon">
                    <Icon size={16} />
                  </span>
                  {perk.text}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Right: Form Side */}
      <div className="auth-layout__form-side">
        <div className="auth-layout__form-container">
          <Link to="/" className="auth-layout__logo">
            Roomie
          </Link>

          {/* Page content renders here */}
          <Outlet />
        </div>
      </div>
    </div>
  )
}
