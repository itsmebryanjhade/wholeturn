import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function SmokeApp() {
  return <h1>Test harness ready</h1>
}

describe('frontend test setup', () => {
  it('renders a component heading accessibly', () => {
    render(<SmokeApp />)

    expect(
      screen.getByRole('heading', { name: 'Test harness ready' }),
    ).toBeTruthy()
  })
})
