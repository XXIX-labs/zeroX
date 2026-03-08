import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Spinner } from '@/components/common/Spinner'

describe('Spinner', () => {
  it('renders a div element', () => {
    const { container } = render(<Spinner />)
    expect(container.firstElementChild!.tagName).toBe('DIV')
  })

  it('has spin animation class', () => {
    const { container } = render(<Spinner />)
    const spinner = container.firstElementChild!
    expect(spinner.className).toContain('animate-spin')
  })

  it('has rounded-full class', () => {
    const { container } = render(<Spinner />)
    const spinner = container.firstElementChild!
    expect(spinner.className).toContain('rounded-full')
  })

  // ─── Size variants ───────────────────────────────────────────────────────

  it('uses md size by default', () => {
    const { container } = render(<Spinner />)
    const spinner = container.firstElementChild!
    expect(spinner.className).toContain('w-5')
    expect(spinner.className).toContain('h-5')
  })

  it('renders sm size', () => {
    const { container } = render(<Spinner size="sm" />)
    const spinner = container.firstElementChild!
    expect(spinner.className).toContain('w-4')
    expect(spinner.className).toContain('h-4')
  })

  it('renders lg size', () => {
    const { container } = render(<Spinner size="lg" />)
    const spinner = container.firstElementChild!
    expect(spinner.className).toContain('w-7')
    expect(spinner.className).toContain('h-7')
  })

  it('applies custom className', () => {
    const { container } = render(<Spinner className="mt-4" />)
    const spinner = container.firstElementChild!
    expect(spinner.className).toContain('mt-4')
  })

  it('has border styling for the spinner ring', () => {
    const { container } = render(<Spinner />)
    const spinner = container.firstElementChild!
    expect(spinner.className).toContain('border-border')
    expect(spinner.className).toContain('border-t-accent')
  })
})
