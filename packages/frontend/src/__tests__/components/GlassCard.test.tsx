import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlassCard } from '@/components/common/GlassCard'

describe('GlassCard', () => {
  it('renders children', () => {
    render(<GlassCard>Card Content</GlassCard>)
    expect(screen.getByText('Card Content')).toBeTruthy()
  })

  it('renders as a div', () => {
    const { container } = render(<GlassCard>Content</GlassCard>)
    expect(container.firstElementChild!.tagName).toBe('DIV')
  })

  // ─── Elevated prop ───────────────────────────────────────────────────────

  it('uses default (non-elevated) styling', () => {
    const { container } = render(<GlassCard>Default</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).toContain('bg-surface')
    expect(card.className).toContain('border-border')
    expect(card.className).not.toContain('bg-surface-elevated')
  })

  it('applies elevated styling when elevated=true', () => {
    const { container } = render(<GlassCard elevated>Elevated</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).toContain('bg-surface-elevated')
    expect(card.className).toContain('border-border-bright')
  })

  // ─── Padding prop ────────────────────────────────────────────────────────

  it('applies md padding by default', () => {
    const { container } = render(<GlassCard>Default Pad</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).toContain('p-5')
  })

  it('applies sm padding', () => {
    const { container } = render(<GlassCard padding="sm">Small</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).toContain('p-4')
  })

  it('applies lg padding', () => {
    const { container } = render(<GlassCard padding="lg">Large</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).toContain('p-6')
  })

  it('applies no padding when padding="none"', () => {
    const { container } = render(<GlassCard padding="none">No Pad</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).toContain('p-0')
  })

  // ─── Glow prop ───────────────────────────────────────────────────────────

  it('has no glow by default', () => {
    const { container } = render(<GlassCard>No Glow</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).not.toContain('shadow-glow')
  })

  it('applies accent glow', () => {
    const { container } = render(<GlassCard glow="accent">Accent</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).toContain('shadow-glow-accent')
  })

  it('applies danger glow', () => {
    const { container } = render(<GlassCard glow="danger">Danger</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).toContain('shadow-glow-danger')
  })

  // ─── Custom props ────────────────────────────────────────────────────────

  it('applies custom className', () => {
    const { container } = render(
      <GlassCard className="custom-class">Custom</GlassCard>
    )
    const card = container.firstElementChild!
    expect(card.className).toContain('custom-class')
  })

  it('forwards additional HTML attributes', () => {
    render(<GlassCard data-testid="glass-card">Attrs</GlassCard>)
    expect(screen.getByTestId('glass-card')).toBeTruthy()
  })

  it('has base styling classes', () => {
    const { container } = render(<GlassCard>Base</GlassCard>)
    const card = container.firstElementChild!
    expect(card.className).toContain('rounded-xl')
    expect(card.className).toContain('border')
    expect(card.className).toContain('transition-all')
  })

  it('supports ref forwarding', () => {
    let refValue: HTMLDivElement | null = null
    render(
      <GlassCard ref={(el) => { refValue = el }}>Ref Test</GlassCard>
    )
    expect(refValue).toBeInstanceOf(HTMLDivElement)
  })
})
