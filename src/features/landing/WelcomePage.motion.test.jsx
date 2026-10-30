import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WelcomePage } from './WelcomePage.jsx'

afterEach(() => vi.unstubAllGlobals())

it('animates the daybook line without hiding section text', () => {
  let observer
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) {
      this.callback = callback
      this.observe = vi.fn()
      this.unobserve = vi.fn()
      this.disconnect = vi.fn()
      observer = this
    }
  })

  render(<WelcomePage onSignIn={() => {}} onCreateAccount={() => {}} onExploreDemo={() => {}} />)
  const intro = screen.getByRole('heading', { name: 'How Wholeturn works.' }).parentElement
  const daybook = document.querySelector('.welcome-daybook')

  expect(observer).toBeDefined()
  expect(observer.observe).toHaveBeenCalledWith(daybook)
  act(() => observer.callback([{ isIntersecting: true, target: intro }, { isIntersecting: true, target: daybook }]))
  expect(intro.classList.contains('welcome-reveal')).toBe(false)
  expect(daybook.classList.contains('welcome-daybook-active')).toBe(true)
  expect(observer.unobserve).toHaveBeenCalledWith(daybook)
})

it('keeps landing content static when reduced motion is requested', () => {
  const createObserver = vi.fn()
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('IntersectionObserver', createObserver)

  render(<WelcomePage onSignIn={() => {}} onCreateAccount={() => {}} onExploreDemo={() => {}} />)

  expect(createObserver).not.toHaveBeenCalled()
  expect(document.querySelector('.welcome-daybook').classList.contains('welcome-daybook-active')).toBe(false)
})
