import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearReturnPath,
  isReturnablePath,
  peekReturnPath,
  rememberReturnPath,
} from './authManager'

describe('return path after login', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('accepts an in-app path, with its query', () => {
    expect(isReturnablePath('/w/alpha/chat?session=abc')).toBe(true)
  })

  it('refuses anything that could send the person off the app or back into a loop', () => {
    expect(isReturnablePath('//evil.example')).toBe(false)
    expect(isReturnablePath('https://evil.example/today')).toBe(false)
    expect(isReturnablePath('/login')).toBe(false)
    expect(isReturnablePath('/login?from=/today')).toBe(false)
    expect(isReturnablePath('/auth/callback?code=1')).toBe(false)
    expect(isReturnablePath('today')).toBe(false)
    expect(isReturnablePath(undefined)).toBe(false)
    expect(isReturnablePath(42)).toBe(false)
  })

  it('remembers, peeks and clears the path around a forced logout', () => {
    rememberReturnPath('/w/alpha/chat?session=abc')
    expect(peekReturnPath()).toBe('/w/alpha/chat?session=abc')
    clearReturnPath()
    expect(peekReturnPath()).toBeNull()
  })

  it('never returns a stored value that is not an in-app path', () => {
    sessionStorage.setItem('po.auth.returnPath', '//evil.example')
    expect(peekReturnPath()).toBeNull()
  })

  it('does not store an auth route', () => {
    rememberReturnPath('/login')
    expect(peekReturnPath()).toBeNull()
  })
})
