import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import './RoomWorkflow.css'

const STEPS = [
  { label: 'Upload photos', suffix: '' },
  { label: 'Set up design', suffix: '/design' },
  { label: 'Review design', suffix: '/compare' },
  { label: 'Choose items', suffix: '/furniture' },
]

export default function RoomWorkflow({ roomId, currentStep }) {
  return (
    <nav className="room-workflow" aria-label="Room design progress">
      {STEPS.map((step, index) => {
        const number = index + 1
        const complete = number < currentStep
        const current = number === currentStep
        const content = (
          <>
            <span className="room-workflow__number">
              {complete ? <Check size={15} /> : number}
            </span>
            <span className="room-workflow__label">{step.label}</span>
          </>
        )
        return (
          <div
            key={step.label}
            className={`room-workflow__step${current ? ' room-workflow__step--current' : ''}${complete ? ' room-workflow__step--complete' : ''}`}
            aria-current={current ? 'step' : undefined}
          >
            {complete ? <Link to={`/room/${roomId}${step.suffix}`}>{content}</Link> : content}
          </div>
        )
      })}
    </nav>
  )
}
