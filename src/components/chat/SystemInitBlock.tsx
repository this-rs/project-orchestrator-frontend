import { useId, useMemo, useState } from 'react'
import { Ban, Check, ChevronDown, ChevronRight, Settings } from 'lucide-react'
import type { ContentBlock } from '@/types'
import { useT } from '@/i18n'
import { allowAvailability, groupTools, SHORTENED_SERVER } from '@/utils/toolInventory'

interface SystemInitBlockProps {
  block: ContentBlock
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

export function SystemInitBlock({ block }: SystemInitBlockProps) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const model = block.metadata?.model as string | undefined
  const tools = useMemo(() => strings(block.metadata?.tools), [block.metadata?.tools])
  const allow = useMemo(() => strings(block.metadata?.tool_allow), [block.metadata?.tool_allow])
  const toolsCount = tools.length > 0 ? tools.length : ((block.metadata?.tools_count as number) ?? 0)
  const mcpServersCount = (block.metadata?.mcp_servers_count as number) ?? 0
  const permissionMode = block.metadata?.permission_mode as string | undefined
  // The inventory needs the names: an older block only kept the count.
  const canExpand = tools.length > 0

  return (
    <div className="py-1.5 my-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Settings className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />

        <span className="text-xs text-gray-500">{t('session.init.title')}</span>

        {model && (
          <span className="px-1.5 py-0.5 bg-indigo-600/20 text-indigo-300 text-[10px] rounded font-medium">{model}</span>
        )}

        {toolsCount > 0 &&
          (canExpand ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              title={t('session.tools.toggle')}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex min-h-6 items-center gap-0.5 px-1.5 py-0.5 bg-gray-700/50 text-gray-300 text-[10px] rounded hover:bg-gray-700/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {open ? (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
              {t('session.init.tools', { count: toolsCount })}
            </button>
          ) : (
            <span className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 text-[10px] rounded">
              {t('session.init.tools', { count: toolsCount })}
            </span>
          ))}

        {mcpServersCount > 0 && (
          <span className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 text-[10px] rounded">
            {t('session.init.mcpServers', { count: mcpServersCount })}
          </span>
        )}

        {permissionMode && (
          <span className="px-1.5 py-0.5 bg-orange-600/20 text-orange-300 text-[10px] rounded">{permissionMode}</span>
        )}
      </div>

      {/* Always in the DOM so `aria-controls` names an element that exists; hidden when collapsed. */}
      {canExpand && <ToolInventory id={panelId} tools={tools} allow={allow} hidden={!open} />}
    </div>
  )
}

/** What the session really offers, by MCP server, and which allow patterns match none of it. */
export function ToolInventory({
  id,
  tools,
  allow,
  hidden,
}: {
  id?: string
  tools: readonly string[]
  allow: readonly string[]
  hidden?: boolean
}) {
  const { t } = useT()
  const groups = useMemo(() => groupTools(tools), [tools])
  const patterns = useMemo(() => allowAvailability(allow, tools), [allow, tools])

  return (
    <div
      id={id}
      hidden={hidden}
      data-testid="tool-inventory"
      className="mt-1.5 ml-5 space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-gray-300"
    >
      <section aria-label={t('session.tools.heading')}>
        <p className="font-medium text-gray-200">{t('session.tools.heading')}</p>
        <ul className="mt-1 space-y-1.5">
          {groups.map((group) => {
            const label =
              group.server === null
                ? t('session.tools.builtin')
                : group.server === SHORTENED_SERVER
                  ? t('session.tools.shortened')
                  : t('session.tools.server', { server: group.server })
            return (
              <li key={group.server ?? ''} data-testid="tool-group" data-server={group.server ?? ''}>
                <p className="text-gray-400">
                  {label} <span className="text-gray-500">· {t('session.tools.count', { count: group.tools.length })}</span>
                </p>
                <ul aria-label={label} className="mt-0.5 flex flex-wrap gap-1">
                  {group.tools.map((tool) => (
                    <li key={tool} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
                      {tool}
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </section>

      {patterns.length > 0 && (
        <section aria-label={t('session.tools.allowHeading')}>
          <p className="font-medium text-gray-200">{t('session.tools.allowHeading')}</p>
          <ul className="mt-1 space-y-0.5">
            {patterns.map(({ pattern, matches }) => {
              const available = matches.length > 0
              return (
                <li
                  key={pattern}
                  data-testid="allow-pattern"
                  data-available={available ? 'true' : 'false'}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {available ? (
                    <Check className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Ban className="h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
                  )}
                  <code className={`font-mono text-[10px] ${available ? 'text-gray-300' : 'text-gray-500 line-through'}`}>
                    {pattern}
                  </code>
                  <span className={available ? 'text-gray-500' : 'text-amber-300'}>
                    {available
                      ? t('session.tools.available', { count: matches.length })
                      : t('session.tools.unavailable')}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
