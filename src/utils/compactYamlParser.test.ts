/**
 * Tests for the compact YAML parser.
 *
 * Run with: npx vitest run src/utils/compactYamlParser.test.ts
 */

import { describe, it, expect } from 'vitest'
import { parseCompactYaml } from './compactYamlParser'
import { parseResult } from '../components/chat/tools/mcp/utils'

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

describe('parseCompactYaml — scalars', () => {
  it('parse null', () => {
    expect(parseCompactYaml('null')).toBeNull()
  })

  it('parse true', () => {
    expect(parseCompactYaml('true')).toBe(true)
  })

  it('parse false', () => {
    expect(parseCompactYaml('false')).toBe(false)
  })

  it('parse integer', () => {
    expect(parseCompactYaml('42')).toBe(42)
  })

  it('parse float', () => {
    expect(parseCompactYaml('2.71')).toBe(2.71)
  })

  it('parse empty string', () => {
    expect(parseCompactYaml('')).toBeNull()
  })

  it('parse empty object', () => {
    expect(parseCompactYaml('{}')).toEqual({})
  })

  it('parse empty array', () => {
    expect(parseCompactYaml('[]')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Simple objects
// ---------------------------------------------------------------------------

describe('parseCompactYaml — simple objects', () => {
  it('parse simple object', () => {
    const input = `id: abc-123
title: My Task
status: completed
priority: 3`
    const result = parseCompactYaml(input) as Record<string, unknown>
    expect(result.id).toBe('abc-123')
    expect(result.title).toBe('My Task')
    expect(result.status).toBe('completed')
    expect(result.priority).toBe(3)
  })

  it('parse boolean fields', () => {
    const input = `active: true
archived: false`
    const result = parseCompactYaml(input) as Record<string, unknown>
    expect(result.active).toBe(true)
    expect(result.archived).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Inline arrays
// ---------------------------------------------------------------------------

describe('parseCompactYaml — inline arrays', () => {
  it('parse inline scalar array', () => {
    const input = `tags: [rust, api, mcp]`
    const result = parseCompactYaml(input) as Record<string, unknown>
    expect(result.tags).toEqual(['rust', 'api', 'mcp'])
  })

  it('parse inline number array', () => {
    expect(parseCompactYaml('[1, 2, 3]')).toEqual([1, 2, 3])
  })

  it('parse inline string array', () => {
    expect(parseCompactYaml('[a, b, c]')).toEqual(['a', 'b', 'c'])
  })

  it('parse empty inline array', () => {
    const input = `items: []`
    const result = parseCompactYaml(input) as Record<string, unknown>
    expect(result.items).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Quoted strings
// ---------------------------------------------------------------------------

describe('parseCompactYaml — quoted strings', () => {
  it('parse quoted string with newlines', () => {
    const input = `content: "line1\\nline2"`
    const result = parseCompactYaml(input) as Record<string, unknown>
    expect(result.content).toBe('line1\nline2')
  })

  it('parse quoted boolean-like string', () => {
    const input = `flag: "true"`
    const result = parseCompactYaml(input) as Record<string, unknown>
    expect(result.flag).toBe('true')
  })

  it('parse quoted string with escaped quotes', () => {
    const input = `msg: "he said \\"hello\\""`
    const result = parseCompactYaml(input) as Record<string, unknown>
    expect(result.msg).toBe('he said "hello"')
  })
})

// ---------------------------------------------------------------------------
// Nested objects
// ---------------------------------------------------------------------------

describe('parseCompactYaml — nested objects', () => {
  it('parse nested object', () => {
    const input = `milestone:
  id: abc
  title: v1.0
progress:
  total: 5
  completed: 3`
    const result = parseCompactYaml(input) as Record<string, unknown>
    const milestone = result.milestone as Record<string, unknown>
    const progress = result.progress as Record<string, unknown>
    expect(milestone.id).toBe('abc')
    expect(milestone.title).toBe('v1.0')
    expect(progress.total).toBe(5)
    expect(progress.completed).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Object arrays (YAML-style `- `)
// ---------------------------------------------------------------------------

describe('parseCompactYaml — object arrays', () => {
  it('parse object array', () => {
    const input = `tasks:
  - id: 1
    title: First
  - id: 2
    title: Second`
    const result = parseCompactYaml(input) as Record<string, unknown>
    const tasks = result.tasks as Record<string, unknown>[]
    expect(tasks).toHaveLength(2)
    expect(tasks[0].id).toBe(1)
    expect(tasks[0].title).toBe('First')
    expect(tasks[1].id).toBe(2)
    expect(tasks[1].title).toBe('Second')
  })

  it('parse top-level object array', () => {
    const input = `- id: 1
  name: Project A
- id: 2
  name: Project B`
    const result = parseCompactYaml(input) as Record<string, unknown>[]
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
    expect(result[0].name).toBe('Project A')
    expect(result[1].id).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Deeply nested
// ---------------------------------------------------------------------------

describe('parseCompactYaml — deeply nested', () => {
  it('parse deeply nested structure', () => {
    const input = `plan:
  tasks:
    - id: t1
      steps:
        - desc: Step A
          order: 1
        - desc: Step B
          order: 2`
    const result = parseCompactYaml(input) as Record<string, unknown>
    const plan = result.plan as Record<string, unknown>
    const tasks = plan.tasks as Record<string, unknown>[]
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('t1')
    const steps = tasks[0].steps as Record<string, unknown>[]
    expect(steps).toHaveLength(2)
    expect(steps[0].desc).toBe('Step A')
    expect(steps[0].order).toBe(1)
    expect(steps[1].desc).toBe('Step B')
  })
})

// ---------------------------------------------------------------------------
// Realistic responses
// ---------------------------------------------------------------------------

describe('parseCompactYaml — realistic responses', () => {
  it('parse realistic task response', () => {
    const input = `id: 4ee35887-fe28-4536-9c55-411c3559dbb6
title: Implement dual-mode MCP
description: Support both direct and HTTP modes
status: in_progress
priority: 3
tags: [mcp, architecture]
created_at: 2024-01-15T10:00:00Z
updated_at: 2024-01-16T10:00:00Z`
    const result = parseCompactYaml(input) as Record<string, unknown>
    expect(result.id).toBe('4ee35887-fe28-4536-9c55-411c3559dbb6')
    expect(result.title).toBe('Implement dual-mode MCP')
    expect(result.status).toBe('in_progress')
    expect(result.priority).toBe(3)
    expect(result.tags).toEqual(['mcp', 'architecture'])
  })

  it('parse realistic list response', () => {
    const input = `items:
  - id: abc
    title: Task 1
    status: completed
    tags: [backend]
  - id: def
    title: Task 2
    status: pending
    tags: []
total: 2
limit: 50
offset: 0`
    const result = parseCompactYaml(input) as Record<string, unknown>
    const items = result.items as Record<string, unknown>[]
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('abc')
    expect(items[0].title).toBe('Task 1')
    expect(items[0].status).toBe('completed')
    expect(items[0].tags).toEqual(['backend'])
    expect(items[1].id).toBe('def')
    expect(items[1].status).toBe('pending')
    expect(items[1].tags).toEqual([])
    expect(result.total).toBe(2)
    expect(result.limit).toBe(50)
    expect(result.offset).toBe(0)
  })

  it('parse success response', () => {
    const input = `success: true`
    const result = parseCompactYaml(input) as Record<string, unknown>
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// parseResult — JSON, compact YAML, MCP content-block unwrapping
// ---------------------------------------------------------------------------

describe('parseResult', () => {
  it('plain JSON object', () => {
    const input = JSON.stringify({ id: 'abc', status: 'ok' })
    const result = parseResult(input) as Record<string, unknown>
    expect(result.id).toBe('abc')
    expect(result.status).toBe('ok')
  })

  it('compact YAML string', () => {
    const input = `id: abc-123\ntitle: My Task\nstatus: completed`
    const result = parseResult(input) as Record<string, unknown>
    expect(result.id).toBe('abc-123')
    expect(result.title).toBe('My Task')
    expect(result.status).toBe('completed')
  })

  it('MCP content-block array wrapping JSON', () => {
    const innerData = { functions: ['foo', 'bar'], structs: ['Baz'] }
    const contentBlocks = [{ type: 'text', text: JSON.stringify(innerData) }]
    const input = JSON.stringify(contentBlocks)

    const result = parseResult(input) as Record<string, unknown>
    expect(result.functions).toEqual(['foo', 'bar'])
    expect(result.structs).toEqual(['Baz'])
  })

  it('MCP content-block array wrapping compact YAML', () => {
    const compactYaml = `id: abc\ntitle: Test\nstatus: pending\npriority: 2`
    const contentBlocks = [{ type: 'text', text: compactYaml }]
    const input = JSON.stringify(contentBlocks)

    const result = parseResult(input) as Record<string, unknown>
    expect(result.id).toBe('abc')
    expect(result.title).toBe('Test')
    expect(result.priority).toBe(2)
  })

  it('MCP content-block with file_symbols compact YAML', () => {
    const compactYaml = `functions:\n  - name: handle_request\n    file_path: src/api.rs\n    line: 42\n  - name: parse_input\n    file_path: src/parser.rs\n    line: 10\nstructs:\n  - name: Config\n    file_path: src/config.rs\n    line: 1`
    const contentBlocks = [{ type: 'text', text: compactYaml }]
    const input = JSON.stringify(contentBlocks)

    const result = parseResult(input) as Record<string, unknown>
    const functions = result.functions as Record<string, unknown>[]
    const structs = result.structs as Record<string, unknown>[]
    expect(functions).toHaveLength(2)
    expect(functions[0].name).toBe('handle_request')
    expect(structs).toHaveLength(1)
    expect(structs[0].name).toBe('Config')
  })

  it('MCP multi content-block concatenation', () => {
    const contentBlocks = [
      { type: 'text', text: 'id: abc' },
      { type: 'text', text: '\ntitle: Test' },
    ]
    const input = JSON.stringify(contentBlocks)

    const result = parseResult(input) as Record<string, unknown>
    expect(result.id).toBe('abc')
    expect(result.title).toBe('Test')
  })

  it('null/undefined/empty', () => {
    expect(parseResult(undefined)).toBeNull()
    expect(parseResult('')).toBeNull()
  })

  it('regular JSON array (not content-blocks)', () => {
    const input = JSON.stringify([1, 2, 3])
    expect(parseResult(input)).toEqual([1, 2, 3])
  })
})
