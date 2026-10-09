import { useId, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { providersAtom } from '@/atoms'
import {
  taskModelAliasHelp,
  taskModelAliasInherit,
  taskModelAliasLabel,
} from '@/constants/runProviders'
import { aliasesForInstance } from '@/constants/providers'
import { useProviders } from '@/hooks/useProviders'

interface TaskModelAliasProps {
  /** Current alias of the task; empty = inherits. */
  value: string | null | undefined
  /** `null` clears the override. Throws on failure: the select goes back to the saved value. */
  onChange: (alias: string | null) => Promise<void>
}

const SELECT =
  'px-2 py-1 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-50'

/**
 * Which model alias a task runs on, among the aliases the providers define.
 * Hidden on a backend without provider routes — unless the task already has an
 * alias, which is then shown (and can be cleared) rather than silently dropped.
 */
export function TaskModelAlias({ value, onChange }: TaskModelAliasProps) {
  const id = useId()
  const { providers, state } = useProviders()
  const table = useAtomValue(providersAtom)?.aliases
  const [saving, setSaving] = useState(false)

  const names = useMemo(() => {
    const set = new Set<string>()
    for (const p of providers) for (const a of aliasesForInstance(p, table)) set.add(a.alias)
    for (const a of table ?? []) set.add(a.alias)
    // An alias the task carries stays selectable even if no instance lists it any more.
    if (value) set.add(value)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [providers, table, value])

  if (names.length === 0 || (state !== 'ready' && !value)) return null

  return (
    <div data-testid="task-model-alias" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <label htmlFor={id} className="text-xs text-gray-400">
        {taskModelAliasLabel()}
      </label>
      <select
        id={id}
        className={SELECT}
        value={value ?? ''}
        disabled={saving}
        aria-describedby={`${id}-help`}
        onChange={async (e) => {
          setSaving(true)
          try {
            await onChange(e.target.value || null)
          } catch {
            // The parent reports it; the controlled value stays the saved one.
          } finally {
            setSaving(false)
          }
        }}
      >
        <option value="">{taskModelAliasInherit()}</option>
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <p id={`${id}-help`} className="basis-full text-[11px] text-gray-500">
        {taskModelAliasHelp()}
      </p>
    </div>
  )
}
