/**
 * What a `permission_request` carries into its block: the tool call it is about, and whether the
 * backend said THIS call may be answered `always` (P11b).
 */
import { describe, it, expect } from 'vitest'
import { permissionCallOf } from './chatAssembly'

describe('permissionCallOf', () => {
  it('carries the tool call and the always eligibility the backend sent', () => {
    expect(permissionCallOf({ tool_use_id: 't1', always: true })).toEqual({ tool_use_id: 't1', always_eligible: true })
  })

  it('no eligibility unless the backend said true', () => {
    expect(permissionCallOf({ tool_use_id: 't1' })).toEqual({ tool_use_id: 't1' })
    expect(permissionCallOf({ always: false })).toEqual({})
    expect(permissionCallOf({ always: 'yes' })).toEqual({})
    expect(permissionCallOf(null)).toEqual({})
  })

  it('carries the consent PO asserted, and drops a malformed one', () => {
    const consent = { subject: 'https://docs.rs', destinations: ['http://docs.rs', 'https://docs.rs'] }
    expect(permissionCallOf({ always: true, consent })).toEqual({ always_eligible: true, consent })
    expect(permissionCallOf({ consent: { subject: 'https://docs.rs' } })).toEqual({})
    expect(permissionCallOf({ consent: { subject: 1, destinations: [] } })).toEqual({})
    expect(permissionCallOf({ consent: { subject: 'https://docs.rs', destinations: [2] } })).toEqual({})
  })
})
