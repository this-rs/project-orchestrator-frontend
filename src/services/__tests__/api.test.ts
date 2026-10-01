/**
 * apiErrorMessage — the sentence a toast shows.
 *
 * The backend answers errors as `{"error": "..."}` and `ApiError.message`
 * carries that raw body: printed as is, a user reads JSON instead of the
 * reason. Run with: npx vitest run src/services/__tests__/api.test.ts
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../authManager', () => ({
  getValidToken: () => Promise.resolve('test-token'),
  refreshToken: vi.fn(),
  forceLogout: vi.fn(),
}))
vi.mock('../auth', () => ({ getAuthMode: () => 'none' }))
vi.mock('../env', () => ({ isTauri: false, getApiBase: () => '/api' }))

import { ApiError, apiErrorMessage } from '../api'

describe('apiErrorMessage', () => {
  it('unwraps the server sentence from a JSON error body', () => {
    const err = new ApiError(409, '{"error":"An environment named \'dev\' already exists in this project"}')
    expect(apiErrorMessage(err)).toBe("An environment named 'dev' already exists in this project")
  })

  it('keeps a plain-text body as is', () => {
    expect(apiErrorMessage(new ApiError(500, 'Internal error'))).toBe('Internal error')
  })

  it('keeps a JSON body that carries no error field', () => {
    expect(apiErrorMessage(new ApiError(400, '{"detail":"nope"}'))).toBe('{"detail":"nope"}')
  })

  it('falls back when the body is empty or the value is not an error', () => {
    expect(apiErrorMessage(new ApiError(500, ''), 'Could not save')).toBe('Could not save')
    expect(apiErrorMessage(undefined, 'Could not save')).toBe('Could not save')
    expect(apiErrorMessage(new Error(''), 'Could not save')).toBe('Could not save')
  })

  it('passes a non-API error message through', () => {
    expect(apiErrorMessage(new Error('offline'))).toBe('offline')
  })
})
