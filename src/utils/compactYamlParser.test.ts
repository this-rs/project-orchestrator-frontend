/**
 * Tests for the compact YAML parser.
 * Run with: npx tsx src/utils/compactYamlParser.test.ts
 */

import { parseCompactYaml } from './compactYamlParser'

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`  FAIL: ${msg}`)
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${name}:`, e)
  }
}

console.log('\n── Compact YAML Parser Tests ──\n')

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

test('parse null', () => {
  assert(parseCompactYaml('null') === null, 'null should parse to null')
})

test('parse true', () => {
  assert(parseCompactYaml('true') === true, 'true should parse to true')
})

test('parse false', () => {
  assert(parseCompactYaml('false') === false, 'false should parse to false')
})

test('parse integer', () => {
  assert(parseCompactYaml('42') === 42, '42 should parse to 42')
})

test('parse float', () => {
  assert(parseCompactYaml('2.71') === 2.71, '2.71 should parse to 2.71')
})

test('parse empty string', () => {
  assert(parseCompactYaml('') === null, 'empty string should return null')
})

test('parse empty object', () => {
  assert(deepEqual(parseCompactYaml('{}'), {}), '{} should parse to {}')
})

test('parse empty array', () => {
  assert(deepEqual(parseCompactYaml('[]'), []), '[] should parse to []')
})

// ---------------------------------------------------------------------------
// Simple objects
// ---------------------------------------------------------------------------

test('parse simple object', () => {
  const input = `id: abc-123
title: My Task
status: completed
priority: 3`
  const result = parseCompactYaml(input) as Record<string, unknown>
  assert(result.id === 'abc-123', `id should be abc-123, got ${result.id}`)
  assert(result.title === 'My Task', `title should be My Task, got ${result.title}`)
  assert(result.status === 'completed', `status should be completed, got ${result.status}`)
  assert(result.priority === 3, `priority should be 3, got ${result.priority}`)
})

test('parse boolean fields', () => {
  const input = `active: true
archived: false`
  const result = parseCompactYaml(input) as Record<string, unknown>
  assert(result.active === true, 'active should be true')
  assert(result.archived === false, 'archived should be false')
})

// ---------------------------------------------------------------------------
// Inline arrays
// ---------------------------------------------------------------------------

test('parse inline scalar array', () => {
  const input = `tags: [rust, api, mcp]`
  const result = parseCompactYaml(input) as Record<string, unknown>
  assert(deepEqual(result.tags, ['rust', 'api', 'mcp']), `tags should be [rust, api, mcp]`)
})

test('parse inline number array', () => {
  const result = parseCompactYaml('[1, 2, 3]')
  assert(deepEqual(result, [1, 2, 3]), 'should parse [1, 2, 3]')
})

test('parse inline string array', () => {
  const result = parseCompactYaml('[a, b, c]')
  assert(deepEqual(result, ['a', 'b', 'c']), 'should parse [a, b, c]')
})

test('parse empty inline array', () => {
  const input = `items: []`
  const result = parseCompactYaml(input) as Record<string, unknown>
  assert(deepEqual(result.items, []), 'items should be []')
})

// ---------------------------------------------------------------------------
// Quoted strings
// ---------------------------------------------------------------------------

test('parse quoted string with newlines', () => {
  const input = `content: "line1\\nline2"`
  const result = parseCompactYaml(input) as Record<string, unknown>
  assert(result.content === 'line1\nline2', `content should have newline, got: ${JSON.stringify(result.content)}`)
})

test('parse quoted boolean-like string', () => {
  const input = `flag: "true"`
  const result = parseCompactYaml(input) as Record<string, unknown>
  assert(result.flag === 'true', `flag should be string "true", got: ${typeof result.flag}`)
})

test('parse quoted string with escaped quotes', () => {
  const input = `msg: "he said \\"hello\\""`
  const result = parseCompactYaml(input) as Record<string, unknown>
  assert(result.msg === 'he said "hello"', `msg should have quotes, got: ${result.msg}`)
})

// ---------------------------------------------------------------------------
// Nested objects
// ---------------------------------------------------------------------------

test('parse nested object', () => {
  const input = `milestone:
  id: abc
  title: v1.0
progress:
  total: 5
  completed: 3`
  const result = parseCompactYaml(input) as Record<string, unknown>
  const milestone = result.milestone as Record<string, unknown>
  const progress = result.progress as Record<string, unknown>
  assert(milestone.id === 'abc', `milestone.id should be abc, got ${milestone.id}`)
  assert(milestone.title === 'v1.0', `milestone.title should be v1.0`)
  assert(progress.total === 5, `progress.total should be 5`)
  assert(progress.completed === 3, `progress.completed should be 3`)
})

// ---------------------------------------------------------------------------
// Object arrays (YAML-style `- `)
// ---------------------------------------------------------------------------

test('parse object array', () => {
  const input = `tasks:
  - id: 1
    title: First
  - id: 2
    title: Second`
  const result = parseCompactYaml(input) as Record<string, unknown>
  const tasks = result.tasks as Record<string, unknown>[]
  assert(tasks.length === 2, `should have 2 tasks, got ${tasks.length}`)
  assert(tasks[0].id === 1, `first task id should be 1, got ${tasks[0].id}`)
  assert(tasks[0].title === 'First', `first task title should be First`)
  assert(tasks[1].id === 2, `second task id should be 2`)
  assert(tasks[1].title === 'Second', `second task title should be Second`)
})

test('parse top-level object array', () => {
  const input = `- id: 1
  name: Project A
- id: 2
  name: Project B`
  const result = parseCompactYaml(input) as Record<string, unknown>[]
  assert(Array.isArray(result), 'should be an array')
  assert(result.length === 2, `should have 2 items, got ${result.length}`)
  assert(result[0].id === 1, `first id should be 1`)
  assert(result[0].name === 'Project A', `first name should be Project A`)
  assert(result[1].id === 2, `second id should be 2`)
})

// ---------------------------------------------------------------------------
// Deeply nested
// ---------------------------------------------------------------------------

test('parse deeply nested structure', () => {
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
  assert(tasks.length === 1, `should have 1 task, got ${tasks.length}`)
  assert(tasks[0].id === 't1', `task id should be t1`)
  const steps = tasks[0].steps as Record<string, unknown>[]
  assert(steps.length === 2, `should have 2 steps, got ${steps.length}`)
  assert(steps[0].desc === 'Step A', `first step desc should be Step A`)
  assert(steps[0].order === 1, `first step order should be 1`)
  assert(steps[1].desc === 'Step B', `second step desc should be Step B`)
})

// ---------------------------------------------------------------------------
// Realistic responses
// ---------------------------------------------------------------------------

test('parse realistic task response', () => {
  const input = `id: 4ee35887-fe28-4536-9c55-411c3559dbb6
title: Implement dual-mode MCP
description: Support both direct and HTTP modes
status: in_progress
priority: 3
tags: [mcp, architecture]
created_at: 2024-01-15T10:00:00Z
updated_at: 2024-01-16T10:00:00Z`
  const result = parseCompactYaml(input) as Record<string, unknown>
  assert(result.id === '4ee35887-fe28-4536-9c55-411c3559dbb6', 'id match')
  assert(result.title === 'Implement dual-mode MCP', 'title match')
  assert(result.status === 'in_progress', 'status match')
  assert(result.priority === 3, 'priority match')
  assert(deepEqual(result.tags, ['mcp', 'architecture']), 'tags match')
})

test('parse realistic list response', () => {
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
  assert(items.length === 2, `should have 2 items, got ${items.length}`)
  assert(items[0].id === 'abc', 'first item id')
  assert(items[0].title === 'Task 1', 'first item title')
  assert(items[0].status === 'completed', 'first item status')
  assert(deepEqual(items[0].tags, ['backend']), 'first item tags')
  assert(items[1].id === 'def', 'second item id')
  assert(items[1].status === 'pending', 'second item status')
  assert(deepEqual(items[1].tags, []), 'second item tags')
  assert(result.total === 2, 'total')
  assert(result.limit === 50, 'limit')
  assert(result.offset === 0, 'offset')
})

test('parse success response', () => {
  const input = `success: true`
  const result = parseCompactYaml(input) as Record<string, unknown>
  assert(result.success === true, 'success should be true')
})

// ---------------------------------------------------------------------------
// parseResult — JSON, compact YAML, MCP content-block unwrapping
// ---------------------------------------------------------------------------

// Import parseResult from the utils module (relative to the test's location)
import { parseResult } from '../components/chat/tools/mcp/utils'

console.log('\n── parseResult Tests ──\n')

test('parseResult: plain JSON object', () => {
  const input = JSON.stringify({ id: 'abc', status: 'ok' })
  const result = parseResult(input) as Record<string, unknown>
  assert(result.id === 'abc', `id should be abc, got ${result.id}`)
  assert(result.status === 'ok', `status should be ok, got ${result.status}`)
})

test('parseResult: compact YAML string', () => {
  const input = `id: abc-123\ntitle: My Task\nstatus: completed`
  const result = parseResult(input) as Record<string, unknown>
  assert(result.id === 'abc-123', `id should be abc-123, got ${result.id}`)
  assert(result.title === 'My Task', `title should be My Task, got ${result.title}`)
  assert(result.status === 'completed', `status should be completed`)
})

test('parseResult: MCP content-block array wrapping JSON', () => {
  // This is what arrives when ContentValue::Structured is used by the Claude CLI
  const innerData = { functions: ['foo', 'bar'], structs: ['Baz'] }
  const contentBlocks = [{ type: 'text', text: JSON.stringify(innerData) }]
  const input = JSON.stringify(contentBlocks)

  const result = parseResult(input) as Record<string, unknown>
  assert(deepEqual(result.functions, ['foo', 'bar']), `functions should be [foo, bar], got ${JSON.stringify(result.functions)}`)
  assert(deepEqual(result.structs, ['Baz']), `structs should be [Baz], got ${JSON.stringify(result.structs)}`)
})

test('parseResult: MCP content-block array wrapping compact YAML', () => {
  // MCP content-block with compact YAML inside (from json_to_compact)
  const compactYaml = `id: abc\ntitle: Test\nstatus: pending\npriority: 2`
  const contentBlocks = [{ type: 'text', text: compactYaml }]
  const input = JSON.stringify(contentBlocks)

  const result = parseResult(input) as Record<string, unknown>
  assert(result.id === 'abc', `id should be abc, got ${result.id}`)
  assert(result.title === 'Test', `title should be Test, got ${result.title}`)
  assert(result.priority === 2, `priority should be 2, got ${result.priority}`)
})

test('parseResult: MCP content-block with file_symbols compact YAML', () => {
  const compactYaml = `functions:\n  - name: handle_request\n    file_path: src/api.rs\n    line: 42\n  - name: parse_input\n    file_path: src/parser.rs\n    line: 10\nstructs:\n  - name: Config\n    file_path: src/config.rs\n    line: 1`
  const contentBlocks = [{ type: 'text', text: compactYaml }]
  const input = JSON.stringify(contentBlocks)

  const result = parseResult(input) as Record<string, unknown>
  const functions = result.functions as Record<string, unknown>[]
  const structs = result.structs as Record<string, unknown>[]
  assert(Array.isArray(functions), `functions should be array, got ${typeof functions}`)
  assert(functions.length === 2, `functions should have 2 items, got ${functions.length}`)
  assert(functions[0].name === 'handle_request', `first function name should be handle_request`)
  assert(Array.isArray(structs), `structs should be array, got ${typeof structs}`)
  assert(structs[0].name === 'Config', `first struct name should be Config`)
})

test('parseResult: MCP multi content-block concatenation', () => {
  // Multiple text blocks should be concatenated
  const contentBlocks = [
    { type: 'text', text: 'id: abc' },
    { type: 'text', text: '\ntitle: Test' },
  ]
  const input = JSON.stringify(contentBlocks)

  const result = parseResult(input) as Record<string, unknown>
  assert(result.id === 'abc', `id should be abc, got ${result.id}`)
  assert(result.title === 'Test', `title should be Test, got ${result.title}`)
})

test('parseResult: null/undefined/empty', () => {
  assert(parseResult(undefined) === null, 'undefined should return null')
  assert(parseResult('') === null, 'empty string should return null')
})

test('parseResult: regular JSON array (not content-blocks)', () => {
  // A normal JSON array that is NOT content-blocks should pass through
  const input = JSON.stringify([1, 2, 3])
  const result = parseResult(input)
  assert(deepEqual(result, [1, 2, 3]), `should return [1, 2, 3], got ${JSON.stringify(result)}`)
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`)
if (failed > 0) process.exit(1)
