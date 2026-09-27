import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, ArrowLeft, CheckCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Input from '../../components/Input/Input'
import Button from '../../components/Button/Button'
import './ForgotPasswordPage.css'

export default function ForgotPasswordPage() {
  const { verifyEmail, setNewPassword } = useAuth()
  const navigate = useNavigate()

  // 'email' -> enter + verify the address, 'password' -> set a new one, 'done' -> success
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await verifyEmail(email)
      if (result.exists) {
        setStep('password')
      } else {
        setError('No account found with that email.')
      }
    } catch (requestError) {
      setError(requestError.message || 'Could not verify that email.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await setNewPassword(email, form.password)
      setStep('done')
      setTimeout(() => navigate('/login'), 2000)
    } catch (requestError) {
      setError(requestError.message || 'Could not update your password.')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="forgot-page__success">
        <div className="forgot-page__success-icon">
          <CheckCircle size={32} />
        </div>
        <h1 className="forgot-page__success-title">Password updated</h1>
        <p className="forgot-page__success-text">
          Your password has been changed. Sign in with your new password to continue.
        </p>
        <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/login')}>
          Go to sign in
        </Button>
      </div>
    )
  }

  if (step === 'password') {
    return (
      <div className="forgot-page">
        <h1 className="forgot-page__title">Set a new password</h1>
        <p className="forgot-page__subtitle">
          Email verified: <span className="forgot-page__success-email">{email}</span>. Choose a new
          password for this account.
        </p>

        {error && <p className="forgot-page__error">{error}</p>}

        <form className="forgot-page__form" onSubmit={handlePasswordSubmit}>
          <Input
            label="New password"
            type="password"
            name="password"
            id="new-password"
            placeholder="At least 6 characters"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            iconLeft={<Lock size={18} />}
            required
          />

          <Input
            label="Confirm password"
            type="password"
            name="confirmPassword"
            id="confirm-new-password"
            placeholder="Re-enter your new password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            iconLeft={<Lock size={18} />}
            required
          />

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitting}>
            {submitting ? 'Updating…' : 'Update password'}
          </Button>
        </form>

        <Link to="/login" className="forgot-page__back-link">
          <ArrowLeft size={16} />
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="forgot-page">
      <h1 className="forgot-page__title">Reset password</h1>
      <p className="forgot-page__subtitle">
        Enter the email associated with your account. If it matches, you can set a new password
        right away.
      </p>

      {error && <p className="forgot-page__error">{error}</p>}

      <form className="forgot-page__form" onSubmit={handleEmailSubmit}>
        <Input
          label="Email"
          type="email"
          name="email"
          id="forgot-email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          iconLeft={<Mail size={18} />}
          required
        />

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitting}>
          {submitting ? 'Checking…' : 'Continue'}
        </Button>
      </form>

      <Link to="/login" className="forgot-page__back-link">
        <ArrowLeft size={16} />
        Back to sign in
      </Link>
    </div>
  )
}
