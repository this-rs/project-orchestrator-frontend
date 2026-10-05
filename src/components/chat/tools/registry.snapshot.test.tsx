/**
 * Frozen rendering of the Claude Code tools.
 *
 * These snapshots were taken BEFORE the registry learned about providers: a
 * session without a provider (or on `claude-code`) must keep rendering every
 * tool exactly like this. A diff here is a regression for Claude sessions,
 * not something to update along with a registry change.
 *
 * Run with: npx vitest run src/components/chat/tools/registry.snapshot.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { ToolContent, getToolIcon, getToolSummary } from './index'

interface Case {
  toolName: string
  toolInput: Record<string, unknown>
  resultContent: string
}

const CASES: Case[] = [
  {
    toolName: 'Bash',
    toolInput: { command: 'cargo test --workspace', description: 'Run the test suite', timeout: 120000 },
    resultContent: 'running 12 tests\ntest result: ok. 12 passed; 0 failed',
  },
  {
    toolName: 'Edit',
    toolInput: {
      file_path: '/repo/src/lib.rs',
      old_string: 'fn main() {\n    println!("a");\n}',
      new_string: 'fn main() {\n    println!("b");\n}',
      replace_all: false,
    },
    resultContent: 'The file /repo/src/lib.rs has been updated.',
  },
  {
    toolName: 'Read',
    toolInput: { file_path: '/repo/src/main.ts', offset: 10, limit: 3 },
    resultContent: '    10\tconst a = 1\n    11\tconst b = 2\n    12\texport { a, b }',
  },
  {
    toolName: 'Write',
    toolInput: { file_path: '/repo/notes/todo.md', content: '# Todo\n\n- ship the registry\n' },
    resultContent: 'File created successfully at: /repo/notes/todo.md',
  },
  {
    toolName: 'Glob',
    toolInput: { pattern: 'src/**/*.test.tsx', path: '/repo' },
    resultContent: '/repo/src/a.test.tsx\n/repo/src/b.test.tsx',
  },
  {
    toolName: 'Grep',
    toolInput: { pattern: 'resolveToolRenderer', path: '/repo/src', glob: '*.tsx', output_mode: 'content' },
    resultContent: '/repo/src/tools/index.tsx:42:export function resolveToolRenderer(',
  },
  {
    toolName: 'WebFetch',
    toolInput: { url: 'https://example.com/docs/page', prompt: 'Summarise the page' },
    resultContent: 'The page describes an example.',
  },
  {
    toolName: 'WebSearch',
    toolInput: { query: 'vitest snapshot testing' },
    resultContent: 'Links: [{"title":"Snapshot | Vitest","url":"https://vitest.dev/guide/snapshot"}]',
  },
  {
    toolName: 'TodoWrite',
    toolInput: {
      todos: [
        { content: 'Write the snapshot', status: 'completed', activeForm: 'Writing the snapshot' },
        { content: 'Change the registry', status: 'in_progress', activeForm: 'Changing the registry' },
        { content: 'Run the checks', status: 'pending', activeForm: 'Running the checks' },
      ],
    },
    resultContent: 'Todos have been modified successfully.',
  },
  {
    toolName: 'mcp__project-orchestrator__note',
    toolInput: { action: 'create', project_id: 'a1b2c3d4-0000-0000-0000-000000000000', note_type: 'gotcha', content: 'Watch the cache' },
    resultContent: JSON.stringify({ id: 'n-1', note_type: 'gotcha', content: 'Watch the cache', status: 'active' }),
  },
  {
    toolName: 'SomeUnknownTool',
    toolInput: { alpha: 1, beta: 'two' },
    resultContent: 'done',
  },
]

// The MCP renderers link to entities, so every case renders inside a router.
const html = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>).container.innerHTML

describe('tool registry — frozen Claude Code rendering', () => {
  for (const c of CASES) {
    it(`renders ${c.toolName} (finished)`, () => {
      expect(
        html(<ToolContent toolName={c.toolName} toolInput={c.toolInput} resultContent={c.resultContent} isError={false} isLoading={false} />),
      ).toMatchSnapshot()
    })

    it(`renders ${c.toolName} (running)`, () => {
      expect(html(<ToolContent toolName={c.toolName} toolInput={c.toolInput} isLoading />)).toMatchSnapshot()
    })

    it(`summary and icon of ${c.toolName}`, () => {
      expect({
        summary: getToolSummary(c.toolName, c.toolInput),
        icon: getToolIcon(c.toolName, c.toolInput),
      }).toMatchSnapshot()
    })
  }
})
