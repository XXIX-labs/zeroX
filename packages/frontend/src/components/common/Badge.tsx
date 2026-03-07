import { clsx } from 'clsx'

type BadgeVariant = 'green' | 'yellow' | 'red' | 'accent' | 'muted' | 'blue'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
  dot?: boolean
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  green:  'bg-status-success/10 text-status-success',
  yellow: 'bg-status-warning/10 text-status-warning',
  red:    'bg-status-danger/10 text-status-danger',
  accent: 'bg-accent-dim text-accent',
  muted:  'bg-surface text-text-muted',
  blue:   'bg-status-info/10 text-status-info',
}

const DOT_COLORS: Record<BadgeVariant, string> = {
  green:  'bg-status-success',
  yellow: 'bg-status-warning',
  red:    'bg-status-danger',
  accent: 'bg-accent',
  muted:  'bg-text-dim',
  blue:   'bg-status-info',
}

export function Badge({ variant = 'muted', children, className, dot = false }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-2xs font-medium uppercase tracking-wider',
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {dot && (
        <span className={clsx('w-1 h-1 rounded-full', DOT_COLORS[variant])} />
      )}
      {children}
    </span>
  )
}
