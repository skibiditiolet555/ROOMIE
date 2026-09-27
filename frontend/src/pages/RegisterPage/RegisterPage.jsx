import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { User, Mail, Lock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Input from '../../components/Input/Input'
import Button from '../../components/Button/Button'
import './RegisterPage.css'

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const name = [form.firstName, form.lastName].filter(Boolean).join(' ')
      await register(form.email, form.password, name)
      navigate('/home')
    } catch (requestError) {
      setError(requestError.message || 'Could not create your account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="register-page">
      <h1 className="register-page__title">Create your account</h1>
      <p className="register-page__subtitle">Start designing stunning interiors with AI.</p>

      {error && <p className="register-page__error">{error}</p>}

      <form className="register-page__form" onSubmit={handleSubmit}>
        <div className="register-page__name-row">
          <Input
            label="First Name"
            type="text"
            name="firstName"
            id="register-first-name"
            placeholder="Skibidi"
            value={form.firstName}
            onChange={handleChange}
            iconLeft={<User size={18} />}
            required
          />
          <Input
            label="Last Name"
            type="text"
            name="lastName"
            id="register-last-name"
            placeholder="Toilet"
            value={form.lastName}
            onChange={handleChange}
            iconLeft={<User size={18} />}
            required
          />
        </div>

        <Input
          label="Email"
          type="email"
          name="email"
          id="register-email"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange}
          iconLeft={<Mail size={18} />}
          required
        />

        <Input
          label="Password"
          type="password"
          name="password"
          id="register-password"
          placeholder="Create a strong password"
          value={form.password}
          onChange={handleChange}
          iconLeft={<Lock size={18} />}
          required
        />

        <Input
          label="Confirm Password"
          type="password"
          name="confirmPassword"
          id="register-confirm-password"
          placeholder="Re-enter your password"
          value={form.confirmPassword}
          onChange={handleChange}
          iconLeft={<Lock size={18} />}
          required
        />

        <label className="register-page__terms">
          <input type="checkbox" required />
          <span>
            I agree to the <a href="#">Terms of Service</a> and{' '}
            <a href="#">Privacy Policy</a>
          </span>
        </label>

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create Account'}
        </Button>
      </form>

      <p className="auth-footer-text">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  )
}
