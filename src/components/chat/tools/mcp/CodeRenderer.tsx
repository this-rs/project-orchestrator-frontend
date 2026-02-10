/**
 * CodeRenderer — views for code exploration MCP tools.
 *
 * Handles: search_code, search_project_code, search_workspace_code,
 * get_file_symbols, find_references, get_call_graph, analyze_impact,
 * get_architecture, find_similar_code, find_trait_implementations,
 * find_type_traits, get_impl_blocks, get_file_dependencies.
 */

import { useState } from 'react'
import {
  StatusBadge, SectionHeader, McpContainer, truncate, basename,
  CollapsibleList,
} from './utils'
import { detectLanguage, tokenizeLine } from '../syntax'

// ---------------------------------------------------------------------------
// Copy-path button — small clipboard icon that copies a file path on click
// ---------------------------------------------------------------------------

function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy path"
      className="shrink-0 p-0.5 rounded hover:bg-white/[0.08] text-gray-600 hover:text-gray-400 transition-colors"
    >
      {copied ? (
        <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Syntax-highlighted snippet
// ---------------------------------------------------------------------------

function HighlightedSnippet({ snippet, filePath }: { snippet: string; filePath: string }) {
  const language = detectLanguage(filePath)
  const lines = snippet.split('\n').slice(0, 6) // cap at 6 lines for compactness

  return (
    <pre className="mt-1 px-2 py-1.5 rounded bg-black/30 font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre">
      {lines.map((line, i) => (
        <div key={i}>
          {tokenizeLine(line, language).map((token, j) => (
            <span key={j} className={token.className}>{token.text}</span>
          ))}
        </div>
      ))}
    </pre>
  )
}

// ---------------------------------------------------------------------------
// Search results (search_code, search_project_code, search_workspace_code)
// ---------------------------------------------------------------------------

function SearchResults({ data }: { data: unknown }) {
  // Result is typically an array of search hits
  const items = Array.isArray(data) ? data as Record<string, unknown>[] : []
  if (items.length === 0) {
    return <div className="text-gray-600 italic">No results</div>
  }

  return (
    <McpContainer>
      <SectionHeader count={items.length}>Search results</SectionHeader>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        <CollapsibleList
          items={items}
          limit={5}
          label="results"
          renderItem={(item, i) => {
            const doc = (item.document ?? item) as Record<string, unknown>
            const filePath = (doc.file_path ?? doc.path ?? '') as string
            const name = (doc.name ?? doc.symbol_name ?? '') as string
            const kind = (doc.kind ?? doc.symbol_type ?? '') as string
            const snippet = (doc.docstrings ?? doc.body ?? doc.content ?? '') as string

            return (
              <div key={i} className="px-2 py-1.5 hover:bg-white/[0.02] rounded">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-indigo-400 text-[10px] truncate">
                    {basename(filePath)}
                  </span>
                  {name && <span className="text-gray-300 text-[11px] font-mono">{name}</span>}
                  {kind && (
                    <span className="px-1 py-0.5 rounded text-[9px] bg-white/[0.06] text-gray-500">
                      {kind}
                    </span>
                  )}
                </div>
                {filePath && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="font-mono text-[10px] text-gray-600 truncate">{filePath}</span>
                    <CopyPathButton path={filePath} />
                  </div>
                )}
                {snippet && (
                  <HighlightedSnippet snippet={truncate(snippet, 300)} filePath={filePath} />
                )}
              </div>
            )
          }}
        />
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// File symbols (get_file_symbols)
// ---------------------------------------------------------------------------

function FileSymbols({ data }: { data: Record<string, unknown> }) {
  const categories = ['functions', 'structs', 'enums', 'traits', 'impls', 'macros', 'constants', 'type_aliases']
  const found = categories.filter(c => Array.isArray(data[c]) && (data[c] as unknown[]).length > 0)

  if (found.length === 0) {
    return <div className="text-gray-600 italic">No symbols found</div>
  }

  return (
    <McpContainer>
      {found.map((cat) => {
        const items = data[cat] as (string | Record<string, unknown>)[]
        return (
          <div key={cat}>
            <SectionHeader count={items.length}>{cat}</SectionHeader>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {items.map((item, i) => {
                const name = typeof item === 'string' ? item : (item.name ?? item.symbol_name ?? '') as string
                return (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-white/[0.04] text-gray-400 border border-white/[0.04]"
                  >
                    {name}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// References (find_references)
// ---------------------------------------------------------------------------

function References({ data }: { data: unknown }) {
  const obj = data as Record<string, unknown>
  const refs = (obj.references ?? (Array.isArray(data) ? data : [])) as Record<string, unknown>[]

  if (refs.length === 0) {
    return <div className="text-gray-600 italic">No references found</div>
  }

  // Group references by file
  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const ref of refs) {
    const filePath = (ref.file_path ?? ref.path ?? '') as string
    const key = filePath || '(unknown)'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(ref)
  }

  const groupEntries = Array.from(grouped.entries())

  return (
    <McpContainer>
      <SectionHeader count={refs.length}>References</SectionHeader>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        <CollapsibleList
          items={groupEntries}
          limit={5}
          label="files"
          renderItem={([filePath, fileRefs], gi) => (
            <div key={gi} className="space-y-0.5">
              <div className="flex items-center gap-1.5 px-1">
                <span className="font-mono text-indigo-400 text-[10px] truncate" title={filePath}>
                  {basename(filePath)}
                </span>
                <span className="text-[9px] text-gray-600">({fileRefs.length})</span>
                <CopyPathButton path={filePath} />
              </div>
              {fileRefs.map((ref, i) => {
                const line = ref.line as number | undefined
                const context = (ref.context ?? ref.ref_type ?? '') as string
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-0.5 hover:bg-white/[0.02] rounded text-[11px]">
                    {line != null && <span className="font-mono text-gray-600 shrink-0">:{line}</span>}
                    {context && <span className="text-gray-500 truncate">{context}</span>}
                  </div>
                )
              })}
            </div>
          )}
        />
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Call graph (get_call_graph)
// ---------------------------------------------------------------------------

function CallGraphNode({ item, direction }: { item: Record<string, unknown>; direction: 'caller' | 'callee' }) {
  const name = String(item.name ?? item.function ?? '')
  const filePath = String(item.file_path ?? '')
  const depth = typeof item.depth === 'number' ? item.depth : 0
  const arrow = direction === 'caller' ? '\u2190' : '\u2192'

  return (
    <div
      className="flex items-center gap-1.5 py-0.5 text-[11px]"
      style={{ paddingLeft: `${(depth + 1) * 12}px` }}
    >
      <span className="text-gray-700 shrink-0 font-mono text-[10px] select-none">
        {depth > 0 ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500'}
      </span>
      <span className="text-gray-600 shrink-0">{arrow}</span>
      <span className="font-mono text-gray-400">{name}</span>
      {filePath && (
        <span className="font-mono text-gray-600 text-[10px]">{basename(filePath)}</span>
      )}
    </div>
  )
}

function CallGraph({ data }: { data: Record<string, unknown> }) {
  const callers = (data.callers ?? data.called_by ?? []) as Record<string, unknown>[]
  const callees = (data.callees ?? data.calls ?? []) as Record<string, unknown>[]

  return (
    <McpContainer>
      {callers.length > 0 && (
        <div>
          <SectionHeader count={callers.length}>Called by</SectionHeader>
          <div className="max-h-40 overflow-y-auto border-l border-gray-800/50 ml-1">
            <CollapsibleList
              items={callers}
              limit={8}
              label="callers"
              renderItem={(c, i) => <CallGraphNode key={i} item={c} direction="caller" />}
            />
          </div>
        </div>
      )}
      {callees.length > 0 && (
        <div>
          <SectionHeader count={callees.length}>Calls</SectionHeader>
          <div className="max-h-40 overflow-y-auto border-l border-gray-800/50 ml-1">
            <CollapsibleList
              items={callees}
              limit={8}
              label="callees"
              renderItem={(c, i) => <CallGraphNode key={i} item={c} direction="callee" />}
            />
          </div>
        </div>
      )}
      {callers.length === 0 && callees.length === 0 && (
        <div className="text-gray-600 italic">No call graph data</div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Impact analysis (analyze_impact)
// ---------------------------------------------------------------------------

function ImpactAnalysis({ data }: { data: Record<string, unknown> }) {
  const impactLevel = (data.impact_level ?? data.level ?? '') as string
  const target = data.target as string | undefined
  const callerCount = data.caller_count as number | undefined
  const depFiles = (data.dependent_files ?? []) as string[]

  return (
    <McpContainer>
      <div className="flex items-center gap-2">
        {target && <span className="font-mono text-gray-300">{target}</span>}
        {impactLevel && <StatusBadge status={impactLevel} />}
      </div>

      <div className="space-y-0.5 mt-1">
        {callerCount != null && (
          <div className="text-[11px] text-gray-500">
            <span className="text-gray-600">callers:</span> {callerCount}
          </div>
        )}
        {depFiles.length > 0 && (
          <div>
            <SectionHeader count={depFiles.length}>Dependent files</SectionHeader>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {depFiles.map((f, i) => (
                <div key={i} className="font-mono text-[10px] text-gray-500 px-2">{f}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Architecture overview (get_architecture)
// ---------------------------------------------------------------------------

function Architecture({ data }: { data: Record<string, unknown> }) {
  const rawFiles = (data.top_files ?? data.files ?? []) as Record<string, unknown>[]
  const languages = data.languages as Record<string, unknown> | undefined

  // Sort files by connection count descending
  const files = [...rawFiles].sort((a, b) => {
    const ca = (typeof a.connections === 'number' ? a.connections : typeof a.count === 'number' ? a.count : 0) as number
    const cb = (typeof b.connections === 'number' ? b.connections : typeof b.count === 'number' ? b.count : 0) as number
    return cb - ca
  })

  // Compute max connections for proportional bar
  const maxConnections = files.reduce((max, f) => {
    const c = (typeof f.connections === 'number' ? f.connections : typeof f.count === 'number' ? f.count : 0) as number
    return Math.max(max, c)
  }, 1) // min 1 to avoid division by zero

  return (
    <McpContainer>
      {languages && Object.keys(languages).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {Object.entries(languages).map(([lang, count]) => (
            <span key={lang} className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-800/20">
              {lang}: {typeof count === 'number' ? count : String(count)}
            </span>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div>
          <SectionHeader count={files.length}>Most connected files</SectionHeader>
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            <CollapsibleList
              items={files}
              limit={8}
              label="files"
              renderItem={(f, i) => {
                const connections = (typeof f.connections === 'number' ? f.connections : typeof f.count === 'number' ? f.count : 0) as number
                const filePath = (f.path ?? f.file_path ?? '') as string
                const barWidth = Math.round((connections / maxConnections) * 100)

                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-0.5 text-[11px] group" title={filePath}>
                    <span className="font-mono text-gray-600 shrink-0 w-6 text-right">
                      {connections}
                    </span>
                    <div className="w-16 shrink-0 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500/60"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="font-mono text-gray-400 truncate">{basename(filePath)}</span>
                  </div>
                )
              }}
            />
          </div>
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Trait implementations / type traits / impl blocks
// ---------------------------------------------------------------------------

function SymbolList({ data, label }: { data: unknown; label: string }) {
  const items = Array.isArray(data)
    ? data as Record<string, unknown>[]
    : (data as Record<string, unknown>)?.implementations
      ?? (data as Record<string, unknown>)?.traits
      ?? (data as Record<string, unknown>)?.impls
      ?? []

  const list = Array.isArray(items) ? items as Record<string, unknown>[] : []

  if (list.length === 0) {
    return <div className="text-gray-600 italic">No {label} found</div>
  }

  return (
    <McpContainer>
      <SectionHeader count={list.length}>{label}</SectionHeader>
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {list.map((item, i) => {
          const name = (item.name ?? item.type_name ?? item.trait_name ?? '') as string
          const filePath = (item.file_path ?? '') as string
          return (
            <div key={i} className="flex items-center gap-2 px-2 py-0.5 text-[11px]">
              <span className="font-mono text-gray-300">{name}</span>
              {filePath && (
                <span className="font-mono text-gray-600 text-[10px]">{basename(filePath)}</span>
              )}
            </div>
          )
        })}
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// File dependencies (get_file_dependencies)
// ---------------------------------------------------------------------------

function FileDepItem({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-1 group px-2 hover:bg-white/[0.02] rounded">
      <span className="font-mono text-[10px] text-gray-500 truncate" title={path}>{path}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyPathButton path={path} />
      </span>
    </div>
  )
}

function FileDependencies({ data }: { data: Record<string, unknown> }) {
  const imports = (data.imports ?? []) as string[]
  const dependents = (data.dependents ?? data.imported_by ?? []) as string[]

  return (
    <McpContainer>
      {imports.length > 0 && (
        <div>
          <SectionHeader count={imports.length}>Imports</SectionHeader>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            <CollapsibleList
              items={imports}
              limit={6}
              label="imports"
              renderItem={(f, i) => <FileDepItem key={i} path={f} />}
            />
          </div>
        </div>
      )}
      {dependents.length > 0 && (
        <div>
          <SectionHeader count={dependents.length}>Imported by</SectionHeader>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            <CollapsibleList
              items={dependents}
              limit={6}
              label="dependents"
              renderItem={(f, i) => <FileDepItem key={i} path={f} />}
            />
          </div>
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const CODE_RENDERERS: Record<string, React.ComponentType<{ data: unknown }>> = {
  search_code: ({ data }) => <SearchResults data={data} />,
  search_project_code: ({ data }) => <SearchResults data={data} />,
  search_workspace_code: ({ data }) => <SearchResults data={data} />,
  find_similar_code: ({ data }) => <SearchResults data={data} />,
  get_file_symbols: ({ data }) => <FileSymbols data={(data ?? {}) as Record<string, unknown>} />,
  find_references: ({ data }) => <References data={data} />,
  get_call_graph: ({ data }) => <CallGraph data={(data ?? {}) as Record<string, unknown>} />,
  analyze_impact: ({ data }) => <ImpactAnalysis data={(data ?? {}) as Record<string, unknown>} />,
  get_architecture: ({ data }) => <Architecture data={(data ?? {}) as Record<string, unknown>} />,
  find_trait_implementations: ({ data }) => <SymbolList data={data} label="Implementations" />,
  find_type_traits: ({ data }) => <SymbolList data={data} label="Traits" />,
  get_impl_blocks: ({ data }) => <SymbolList data={data} label="Impl blocks" />,
  get_file_dependencies: ({ data }) => <FileDependencies data={(data ?? {}) as Record<string, unknown>} />,
}

export function CodeRenderer({ action, parsed }: { action: string; parsed: unknown; toolInput?: Record<string, unknown> }) {
  const Comp = CODE_RENDERERS[action]
  if (!Comp) return null
  return <Comp data={parsed} />
}
