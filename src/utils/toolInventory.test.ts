import { describe, it, expect } from 'vitest'
import { allowAvailability, groupTools, parseMcpTool, patternMatches } from './toolInventory'

const OFFERED = ['mcp__project-orchestrator__note', 'mcp__project-orchestrator__task', 'mcp__project-orchestrator__plan']

describe('parseMcpTool', () => {
  it('splits server and tool, keeping dashes in the server name', () => {
    expect(parseMcpTool('mcp__project-orchestrator__note')).toEqual({ server: 'project-orchestrator', tool: 'note' })
    expect(parseMcpTool('mcp__nexus__Read')).toEqual({ server: 'nexus', tool: 'Read' })
    expect(parseMcpTool('Read')).toBeNull()
    expect(parseMcpTool('mcp__broken')).toBeNull()
  })
})

describe('groupTools', () => {
  it('groups by MCP server, built-ins first, short names sorted', () => {
    expect(groupTools(['mcp__nexus__Read', 'Bash', ...OFFERED, 'mcp__nexus__Bash', 'Bash'])).toEqual([
      { server: null, tools: ['Bash'] },
      { server: 'nexus', tools: ['Bash', 'Read'] },
      { server: 'project-orchestrator', tools: ['note', 'plan', 'task'] },
    ])
  })
})

describe('patternMatches', () => {
  it('a bare name or a name with an argument designates the canonical nexus tool', () => {
    const offered = ['mcp__nexus__Read', 'mcp__nexus__Bash', 'mcp__other__Read']
    expect(patternMatches('Read', offered)).toEqual(['mcp__nexus__Read'])
    expect(patternMatches('Bash(git *)', offered)).toEqual(['mcp__nexus__Bash'])
    expect(patternMatches('Edit', offered)).toEqual([])
  })

  it('a bare name also designates the built-in of a Claude Code session', () => {
    expect(patternMatches('Bash(npm *)', ['Bash', 'Read'])).toEqual(['Bash'])
  })

  it('an mcp pattern is a glob over the full names', () => {
    expect(patternMatches('mcp__project-orchestrator__*', OFFERED)).toEqual(OFFERED)
    expect(patternMatches('mcp__project-orchestrator__note', OFFERED)).toEqual(['mcp__project-orchestrator__note'])
    expect(patternMatches('mcp__nexus__*', OFFERED)).toEqual([])
  })
})

describe('allowAvailability — the DeepSeek session of 09/10/2026', () => {
  it('only the project-orchestrator pattern is available; Bash, Read, Edit, WebSearch are not', () => {
    const allow = ['mcp__project-orchestrator__*', 'Bash(git *)', 'Bash(cargo *)', 'Bash(npm *)', 'Read', 'Edit', 'WebSearch', 'Read']
    const result = allowAvailability(allow, OFFERED)
    expect(result.map((r) => [r.pattern, r.matches.length > 0])).toEqual([
      ['mcp__project-orchestrator__*', true],
      ['Bash(git *)', false],
      ['Bash(cargo *)', false],
      ['Bash(npm *)', false],
      ['Read', false],
      ['Edit', false],
      ['WebSearch', false],
    ])
  })
})
