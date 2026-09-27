import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import Button from '../Button/Button'
import './Navbar.css'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const closeMobile = () => setMobileOpen(false)

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__inner">
        {/* Logo */}
        <Link to="/" className="navbar__logo" onClick={closeMobile}>
          <span className="navbar__logo-icon">R</span>
          Roomie
        </Link>

        {/* Desktop Links */}
        <ul className="navbar__links">
          <li><a href="#features" className="navbar__link">Features</a></li>
          <li><a href="#how-it-works" className="navbar__link">How It Works</a></li>
          <li><a href="#pricing" className="navbar__link">Pricing</a></li>
        </ul>

        {/* Desktop Actions */}
        <div className="navbar__actions">
          <Link to="/login">
            <Button variant="ghost" size="sm">Log In</Button>
          </Link>
          <Link to="/register">
            <Button variant="primary" size="sm">Get Started</Button>
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button
          className="navbar__toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div className={`navbar__mobile-menu ${mobileOpen ? 'navbar__mobile-menu--open' : ''}`}>
        <a href="#features" className="navbar__mobile-link" onClick={closeMobile}>Features</a>
        <a href="#how-it-works" className="navbar__mobile-link" onClick={closeMobile}>How It Works</a>
        <a href="#pricing" className="navbar__mobile-link" onClick={closeMobile}>Pricing</a>
        <div className="navbar__mobile-actions">
          <Link to="/login" onClick={closeMobile}>
            <Button variant="secondary" size="md" fullWidth>Log In</Button>
          </Link>
          <Link to="/register" onClick={closeMobile}>
            <Button variant="primary" size="md" fullWidth>Get Started</Button>
          </Link>
        </div>
      </div>
    </nav>
  )
}
