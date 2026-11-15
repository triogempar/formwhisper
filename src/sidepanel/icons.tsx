type IconProps = { className?: string }

const svg = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
}

export function LaptopIcon({ className = 'icon' }: IconProps) {
  return (
    <svg className={className} {...svg}>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </svg>
  )
}

export function CloudIcon({ className = 'icon' }: IconProps) {
  return (
    <svg className={className} {...svg}>
      <path d="M7 18h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.5 3.5 0 0 0 7 18z" />
    </svg>
  )
}

export function InfoIcon({ className = 'icon' }: IconProps) {
  return (
    <svg className={className} {...svg}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  )
}
