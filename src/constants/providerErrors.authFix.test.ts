/**
 * `authRequiredFix` tells apart the three things a provider's `login_hint` can be.
 * The two sentences are written by the backend (`chat/provider/credentials.rs`):
 * if one of them changes there, this test is where it must change too.
 *
 * Run with: npx vitest run src/constants/providerErrors.authFix.test.ts
 */
import { describe, it, expect } from 'vitest'
import { authRequiredFix } from './providerErrors'

describe('authRequiredFix', () => {
  it('a vault key that cannot be read is a vault problem, never a command', () => {
    expect(
      authRequiredFix({ login_hint: "store the provider key in the vault and grant it to provider instance 'deepseek'" }),
    ).toEqual({ kind: 'vault' })
  })

  it('a missing env variable names the variable', () => {
    expect(authRequiredFix({ login_hint: 'set the environment variable DEEPSEEK_KEY on the server' })).toEqual({
      kind: 'env',
      variable: 'DEEPSEEK_KEY',
    })
  })

  it('anything else is the command to run', () => {
    expect(authRequiredFix({ login_hint: 'claude login' })).toEqual({ kind: 'login', command: 'claude login' })
    expect(authRequiredFix({ login_hint: '  codex login ' })).toEqual({ kind: 'login', command: 'codex login' })
  })

  it('no hint is unknown, not an empty command', () => {
    expect(authRequiredFix({})).toEqual({ kind: 'unknown' })
    expect(authRequiredFix({ login_hint: '' })).toEqual({ kind: 'unknown' })
    expect(authRequiredFix({ login_hint: null })).toEqual({ kind: 'unknown' })
  })
})
