import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Header.css'

export default function Header({ showSignIn = true }) {
  const [scrolled, setScrolled] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={`site-header ${scrolled ? 'site-header--scrolled' : ''}`}>
      <Link to="/" className="site-header__logo">
        Roomie
      </Link>

      <div className="site-header__actions">
        {showSignIn && (
          <Link to={user ? '/home' : '/login'} className="site-header__signin">
            {user ? user.name : 'sign in'}
          </Link>
        )}
        <Link to={user ? '/home' : '/login'} className="site-header__cta">
          start
        </Link>
      </div>
    </header>
  )
}
