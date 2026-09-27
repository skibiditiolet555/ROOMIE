import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Input from '../../components/Input/Input'
import Button from '../../components/Button/Button'
import './LoginPage.css'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(form.email, form.password)
      navigate('/home')
    } catch (requestError) {
      setError(requestError.message || 'Could not sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <h1 className="login-page__title">Login</h1>

      {error && <p className="login-page__error">{error}</p>}

      <form className="login-page__form" onSubmit={handleSubmit}>
        <Input
          type="email"
          name="email"
          id="login-email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          iconRight={<Mail size={18} />}
          required
        />

        <Input
          type="password"
          name="password"
          id="login-password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          iconRight={<Lock size={18} />}
          required
        />

        <Link to="/forgot-password" className="login-page__forgot">
          Forget your password?
        </Link>

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="auth-footer-text">
        Don&apos;t have Account
        <br />
        <Link to="/register">Register</Link>
      </p>
    </div>
  )
}
