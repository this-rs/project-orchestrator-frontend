/**
 * The one module for permission-mode strings.
 *
 * Run with: npx vitest run src/constants/toolPolicy.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  COMPOSER_MODE_LABELS,
  COMPOSER_MODE_ORDER,
  SESSION_LIST_MODE_LABELS,
  SETUP_MODE_OPTIONS,
  SETUP_MODE_SUMMARIES,
  claudeNativeModeLabel,
  isLegacyWireMode,
  isTrustAllowed,
  readToolPolicyMode,
  settingsModeOptions,
  toWireMode,
} from './toolPolicy'
import { permissionModeMeta } from '@/components/chat/sessionListUtils'

describe('Claude Code labels — word for word what each screen showed before providers', () => {
  it('composer', () => {
    expect(COMPOSER_MODE_ORDER.map((m) => COMPOSER_MODE_LABELS.claude[m])).toEqual([
      'Bypass',
      'Accept Edits',
      'Default',
      'Plan Only',
    ])
  })

  it('session list', () => {
    expect(SESSION_LIST_MODE_LABELS.claude).toEqual({
      trust: 'Bypass permissions',
      auto_edits: 'Accept edits',
      ask: 'Ask permissions',
      plan_only: 'Plan mode',
    })
    expect(permissionModeMeta('acceptEdits')).toEqual({ label: 'Accept edits', dot: 'bg-blue-400' })
    expect(permissionModeMeta('default')).toEqual({ label: 'Ask permissions', dot: 'bg-amber-400' })
  })

  it('permission settings panel', () => {
    expect(settingsModeOptions('claude').map(({ label, description }) => [label, description])).toEqual([
      ['Bypass', 'Auto-approve all tools. No prompts.'],
      ['Accept Edits', 'Auto-approve file edits, prompt for commands.'],
      ['Default', 'Prompt for all tool usage.'],
      ['Plan Only', 'Read-only mode. No writes or commands.'],
    ])
  })

  it('setup wizard', () => {
    expect(SETUP_MODE_OPTIONS.map((o) => o.label)).toEqual(['Bypass', 'Default', 'Accept Edits', 'Plan Only'])
    expect(SETUP_MODE_SUMMARIES.trust).toBe('Bypass (all auto-approved)')
    expect(SETUP_MODE_SUMMARIES.plan_only).toBe('Plan Only (read-only)')
  })
})

describe('neutral labels — for every other provider', () => {
  it('names the four modes without Claude vocabulary', () => {
    expect(COMPOSER_MODE_LABELS.neutral).toEqual({
      trust: 'Trust',
      auto_edits: 'Auto-approve edits',
      ask: 'Ask',
      plan_only: 'Plan only',
    })
    expect(permissionModeMeta('trust', { isClaudeCode: false })?.label).toBe('Trust')
    expect(permissionModeMeta('bypassPermissions', { isClaudeCode: false })?.label).toBe('Trust')
    expect(settingsModeOptions('neutral').map((o) => o.label)).toEqual(['Trust', 'Auto-approve edits', 'Ask', 'Plan only'])
  })
})

describe('reading a mode', () => {
  it.each([
    ['default', 'ask'],
    ['manual', 'ask'],
    ['dontAsk', 'ask'],
    ['acceptEdits', 'auto_edits'],
    ['auto', 'auto_edits'],
    ['plan', 'plan_only'],
    ['bypassPermissions', 'trust'],
  ])('reads the Claude CLI mode %s as %s', (legacy, neutral) => {
    expect(readToolPolicyMode(legacy)).toBe(neutral)
  })

  it('falls back to ask for an absent or unknown mode', () => {
    expect(readToolPolicyMode(undefined)).toBe('ask')
    expect(readToolPolicyMode('yolo')).toBe('ask')
  })

  it.each(['default', 'manual', 'dontAsk', 'acceptEdits', 'auto', 'plan', 'bypassPermissions'])(
    'the session list has a label and a dot for the CLI mode %s',
    (mode) => {
      const meta = permissionModeMeta(mode)
      expect(meta?.label).toBeTruthy()
      expect(meta?.dot).toMatch(/^bg-/)
    },
  )

  it('names the CLI-only modes instead of the neutral mode they fold into', () => {
    expect(permissionModeMeta('auto')?.label).toBe('Auto mode')
    expect(claudeNativeModeLabel('auto', 'short')).toBe('Auto')
    expect(claudeNativeModeLabel('dontAsk', 'short')).toBe("Don't Ask")
    // `manual` is `default` renamed, and the four classic modes need no special name.
    expect(claudeNativeModeLabel('manual', 'short')).toBeNull()
    expect(claudeNativeModeLabel('acceptEdits', 'short')).toBeNull()
    expect(claudeNativeModeLabel('toString', 'short')).toBeNull()
    expect(claudeNativeModeLabel(undefined, 'short')).toBeNull()
  })

  it('shows a mode nobody knows as it came', () => {
    expect(permissionModeMeta('yolo')).toEqual({ label: 'yolo', dot: 'bg-gray-400' })
  })
})

describe('toWireMode', () => {
  it('sends the legacy Claude string when not neutral', () => {
    expect(COMPOSER_MODE_ORDER.map((m) => toWireMode(m, { neutral: false }))).toEqual([
      'bypassPermissions',
      'acceptEdits',
      'default',
      'plan',
    ])
  })

  it('sends the neutral name when neutral', () => {
    expect(COMPOSER_MODE_ORDER.map((m) => toWireMode(m, { neutral: true }))).toEqual(['trust', 'auto_edits', 'ask', 'plan_only'])
  })

  it('knows the four strings the setup wizard may write', () => {
    expect(isLegacyWireMode('bypassPermissions')).toBe(true)
    expect(isLegacyWireMode('auto')).toBe(false)
    expect(isLegacyWireMode('trust')).toBe(false)
    expect(isLegacyWireMode(undefined)).toBe(false)
  })
})

describe('isTrustAllowed (decision A35)', () => {
  it('is always allowed for Claude Code, sandbox or not', () => {
    expect(isTrustAllowed({ isClaudeCode: true, sandboxed: false })).toBe(true)
  })

  it('needs a sandbox for a third-party provider', () => {
    expect(isTrustAllowed({ isClaudeCode: false, sandboxed: false })).toBe(false)
    expect(isTrustAllowed({ isClaudeCode: false, sandboxed: true })).toBe(true)
  })
})
