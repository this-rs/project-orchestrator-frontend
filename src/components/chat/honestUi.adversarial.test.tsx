// Adversarial review of PR #291 (H4, H7): each case reproduces a defect found by
// one of three personas — the demanding user, the a11y/i18n auditor, the edge-case tester.
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ContentBlock } from '@/types'
import { SystemInitBlock } from './SystemInitBlock'
import { EngineBanner } from './EngineBanner'
import { classifyDegradations } from '@/constants/engine'
import { allowAvailability, groupTools } from '@/utils/toolInventory'
import { systemInitToolMetadata } from '@/utils/chatAssembly'

const PO_TOOLS = ['mcp__project-orchestrator__note', 'mcp__project-orchestrator__task', 'mcp__project-orchestrator__plan']
const block = (metadata: Record<string, unknown>): ContentBlock => ({ id: 'si', type: 'system_init', content: '', metadata })

/**
 * `Capabilities` as nexus serialises it (`serde_json::to_value`): every field is
 * there, except `context_window`, skipped when unknown (`skip_serializing_if`).
 */
const NEXUS_CAPS_UNKNOWN_WINDOW = {
  interactive_permissions: true,
  permission_scopes: ['once', 'session'],
  sandbox: 'none',
  secret_isolation: true,
  per_session_mcp: true,
  hooks: 'in_protocol',
  subagents: 'none',
  compaction_signal: true,
  thinking: true,
  images: false,
  tools: true,
  set_model_live: true,
  native_question: false,
  tool_cancel: true,
  background_tasks: false,
  resume: true,
  cost: 'priced',
}

describe('edge cases — allow patterns as nexus matches them', () => {
  it('a bare joker `*` matches every offered tool (nexus globs the offered name too)', () => {
    expect(allowAvailability(['*'], PO_TOOLS)[0].matches).toEqual(PO_TOOLS)
  })

  it('a bare glob such as `*__note` is matched against the full offered name', () => {
    expect(allowAvailability(['*__note'], PO_TOOLS)[0].matches).toEqual(['mcp__project-orchestrator__note'])
  })
})

describe('edge cases — names cut to 64 characters with a hash suffix', () => {
  it('an MCP tool whose server name was cut is never shown as a built-in tool', () => {
    const cut = `mcp__${'a-very-long-mcp-server-name-'.repeat(2)}_1a2b3c4d`.slice(0, 64)
    const groups = groupTools([cut])
    expect(groups).toHaveLength(1)
    expect(groups[0].server).not.toBeNull()
  })
})

describe('demanding user — the context window nexus does not know', () => {
  it('a full nexus declaration without `context_window` is "not probed yet"', () => {
    expect(classifyDegradations(['message_queue'], NEXUS_CAPS_UNKNOWN_WINDOW)).toContainEqual({
      id: 'context_window',
      cause: 'unprobed',
    })
  })

  it('the banner says so in words', () => {
    render(<EngineBanner degraded={['message_queue']} declared={NEXUS_CAPS_UNKNOWN_WINDOW} />)
    expect(screen.getByTestId('engine-banner-unprobed').textContent).toMatch(/not probed yet/)
  })

  it('a partial declaration (only some capabilities) still says nothing about the window', () => {
    expect(classifyDegradations(['message_queue'], { images: false })).not.toContainEqual(
      expect.objectContaining({ id: 'context_window' }),
    )
  })
})

// Rejected on purpose: an agent session whose `system_init` carries no `tools` is NOT a
// session with zero tools. The Codex and ACP adapters always report `tools: []` (they do
// not know the list) and the backend drops an empty list: "unknown" must stay silent.
describe('edge cases — an agent frame without tools', () => {
  it('records no tool list, so nothing is claimed about a Codex or ACP session', () => {
    const evt = { type: 'system_init', engine: 'agent', tool_policy: { mode: 'ask', allow: ['Read'], deny: [] } }
    expect(systemInitToolMetadata(evt)).toEqual({ tool_allow: ['Read'] })
    render(<SystemInitBlock block={block(systemInitToolMetadata(evt))} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('a11y / i18n auditor', () => {
  it('one tool is not "1 tools"', () => {
    render(<SystemInitBlock block={block({ tools: ['mcp__nexus__Read'], tool_allow: ['Read'], mcp_servers_count: 1 })} />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\b1 tools\b/)
    expect(text).not.toMatch(/\b1 MCP servers\b/)
    fireEvent.click(screen.getByRole('button'))
    expect(document.body.textContent ?? '').not.toMatch(/\b1 matching tools\b/)
  })

  it('aria-controls points to an element that exists, even collapsed', () => {
    render(<SystemInitBlock block={block({ tools: PO_TOOLS })} />)
    const toggle = screen.getByRole('button')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const id = toggle.getAttribute('aria-controls')!
    expect(document.getElementById(id)).not.toBeNull()
  })

  it('the disclosure button is at least 24 px high (WCAG 2.2, 2.5.8)', () => {
    render(<SystemInitBlock block={block({ tools: PO_TOOLS })} />)
    expect(screen.getByRole('button').className).toMatch(/\bmin-h-6\b/)
  })
})
