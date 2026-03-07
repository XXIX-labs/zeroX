import { forwardRef } from 'react'
import { clsx } from 'clsx'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean
  glow?: 'accent' | 'danger' | 'none'
  padding?: 'sm' | 'md' | 'lg' | 'none'
  children: React.ReactNode
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ elevated = false, glow = 'none', padding = 'md', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          'rounded-xl border transition-all duration-200',
          elevated
            ? 'bg-surface-elevated border-border-bright'
            : 'bg-surface border-border',
          padding === 'sm' && 'p-4',
          padding === 'md' && 'p-5',
          padding === 'lg' && 'p-6',
          padding === 'none' && 'p-0',
          glow === 'accent' && 'shadow-glow-accent',
          glow === 'danger' && 'shadow-glow-danger',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

GlassCard.displayName = 'GlassCard'
