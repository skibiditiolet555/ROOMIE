import './Card.css'

export default function Card({
  children,
  padding = 'md',
  clickable = false,
  glow = false,
  isStatic = false,
  className = '',
  onClick,
  ...props
}) {
  const classes = [
    'card',
    `card--padding-${padding}`,
    clickable && 'card--clickable',
    glow && 'card--glow',
    isStatic && 'card--static',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} onClick={onClick} {...props}>
      {children}
    </div>
  )
}
