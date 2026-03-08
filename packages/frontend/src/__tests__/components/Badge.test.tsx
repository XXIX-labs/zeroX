import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/common/Badge'

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('defaults to muted variant', () => {
    const { container } = render(<Badge>Default</Badge>)
    const badge = container.firstElementChild!
    expect(badge.className).toContain('bg-surface')
    expect(badge.className).toContain('text-text-muted')
  })

  it('renders green variant', () => {
    const { container } = render(<Badge variant="green">Healthy</Badge>)
    const badge = container.firstElementChild!
    expect(badge.className).toContain('text-status-success')
  })

  it('renders yellow variant', () => {
    const { container } = render(<Badge variant="yellow">Warning</Badge>)
    const badge = container.firstElementChild!
    expect(badge.className).toContain('text-status-warning')
  })

  it('renders red variant', () => {
    const { container } = render(<Badge variant="red">Danger</Badge>)
    const badge = container.firstElementChild!
    expect(badge.className).toContain('text-status-danger')
  })

  it('renders accent variant', () => {
    const { container } = render(<Badge variant="accent">Special</Badge>)
    const badge = container.firstElementChild!
    expect(badge.className).toContain('text-accent')
  })

  it('renders blue variant', () => {
    const { container } = render(<Badge variant="blue">Info</Badge>)
    const badge = container.firstElementChild!
    expect(badge.className).toContain('text-status-info')
  })

  it('renders without dot by default', () => {
    const { container } = render(<Badge>No Dot</Badge>)
    const dots = container.querySelectorAll('.rounded-full')
    expect(dots).toHaveLength(0)
  })

  it('renders dot when dot prop is true', () => {
    const { container } = render(<Badge dot>With Dot</Badge>)
    const dots = container.querySelectorAll('.rounded-full')
    expect(dots).toHaveLength(1)
  })

  it('dot has correct color for green variant', () => {
    const { container } = render(<Badge variant="green" dot>Green Dot</Badge>)
    const dot = container.querySelector('.rounded-full')!
    expect(dot.className).toContain('bg-status-success')
  })

  it('dot has correct color for red variant', () => {
    const { container } = render(<Badge variant="red" dot>Red Dot</Badge>)
    const dot = container.querySelector('.rounded-full')!
    expect(dot.className).toContain('bg-status-danger')
  })

  it('applies custom className', () => {
    const { container } = render(<Badge className="my-custom-class">Custom</Badge>)
    const badge = container.firstElementChild!
    expect(badge.className).toContain('my-custom-class')
  })

  it('renders as a span element', () => {
    const { container } = render(<Badge>Span</Badge>)
    expect(container.firstElementChild!.tagName).toBe('SPAN')
  })

  it('has uppercase styling', () => {
    const { container } = render(<Badge>Upper</Badge>)
    const badge = container.firstElementChild!
    expect(badge.className).toContain('uppercase')
  })
})
