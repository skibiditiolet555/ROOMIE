import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePrefs } from '../../lib/prefs'
import PrefsSwitch from '../PrefsSwitch/PrefsSwitch'
import './AppHeader.css'

export default function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, logout } = useAuth()
  const { lang } = usePrefs()
  const navigate = useNavigate()

  const handleLogout = () => {
    setMenuOpen(false)
    logout()
    navigate('/')
  }

  return (
    <header className="app-header">
      <Link to="/home" className="app-header__logo">
        Roomie
      </Link>

      <div className="app-header__prefs">
        <PrefsSwitch />
      </div>

      <div className="app-header__user">
        <button
          className="app-header__user-btn"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
        >
          <span className="app-header__avatar">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </span>
          <span className="app-header__email">{user?.name || 'You'}</span>
          <ChevronDown size={16} className={`app-header__chevron ${menuOpen ? 'app-header__chevron--open' : ''}`} />
        </button>

        {menuOpen && (
          <div className="app-header__menu">
            <button className="app-header__menu-item" onClick={handleLogout}>
              <LogOut size={16} />
              {lang === 'en' ? 'Log out' : 'ออกจากระบบ'}
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
