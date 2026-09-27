import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import './Input.css'

export default function Input({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  iconLeft,
  iconRight,
  id,
  name,
  required = false,
  className = '',
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false)

  const isPassword = type === 'password'
  const inputType = isPassword && showPassword ? 'text' : type

  const groupClasses = [
    'input-group',
    iconLeft && 'input-group--has-icon-left',
    (iconRight || isPassword) && 'input-group--has-icon-right',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const fieldClasses = [
    'input-field',
    error && 'input-field--error',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      {label && (
        <label className="input-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className={groupClasses}>
        {iconLeft && (
          <span className="input-icon input-icon--left">{iconLeft}</span>
        )}
        <input
          id={id}
          name={name}
          type={inputType}
          className={fieldClasses}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          {...props}
        />
        {isPassword && (
          <span
            className="input-icon input-icon--right"
            onClick={() => setShowPassword(!showPassword)}
            role="button"
            tabIndex={0}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onKeyDown={(e) => e.key === 'Enter' && setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </span>
        )}
        {!isPassword && iconRight && (
          <span className="input-icon input-icon--right">{iconRight}</span>
        )}
      </div>
      {error && <p className="input-error-message">{error}</p>}
    </div>
  )
}
