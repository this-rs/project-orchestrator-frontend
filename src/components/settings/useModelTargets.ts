/**
 * ONE list of model targets for every settings picker that chooses a provider
 * AND a model (roles, aliases): every instance, grouped by provider, then by
 * family for Claude Code.
 *
 * - Claude Code: the live catalog (`GET /api/chat/models`, `modelCatalogAtom`),
 *   grouped Opus / Fable / Sonnet / Haiku… When that catalog could not be read
 *   (offline), the instance lists what the provider list already knows and the
 *   picker says so (text + icon, never a colour alone).
 * - Any other instance: its own catalog (`GET /chat/providers/{id}/models`, cached
 *   for the session by `useModelCatalog`), merged with what the provider list
 *   carries, so a model the endpoint lists is a choice and the stored default too.
 *
 * A target is one `<option>`: `m|<provider>|<model>`, `a|<provider>|<alias>`, or
 * `d|<provider>|` (the instance's default model) — the same encoding the roles
 * picker has always used.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { SearchableOption } from '@/components/ui'
import { useT } from '@/i18n'
import { fetchModelCatalog, modelCatalogAtom, modelCatalogLoadedAtom } from '@/atoms'
import { groupModelsByFamily } from '@/constants/models'
import { modelCapabilities } from '@/constants/providerWizard'
import { isClaudeCodeProvider, type ModelAlias, type ProviderInstance, type ProviderModel } from '@/types/provider'
import type { RoleTarget } from '@/types/providerSettings'
import { loadModelCatalog } from './useModelCatalog'

// ---------------------------------------------------------------------------
// Encoding of a target
// ---------------------------------------------------------------------------

export const encodeTarget = (t: RoleTarget | undefined): string => {
  if (!t) return ''
  if (t.alias) return `a|${t.provider}|${t.alias}`
  if (t.model) return `m|${t.provider}|${t.model}`
  return `d|${t.provider}|`
}

export const decodeTarget = (value: string): RoleTarget | undefined => {
  if (!value) return undefined
  const first = value.indexOf('|')
  const second = value.indexOf('|', first + 1)
  if (first < 0 || second < 0) return undefined
  const kind = value.slice(0, first)
  const provider = value.slice(first + 1, second)
  const rest = value.slice(second + 1)
  if (kind === 'a') return { provider, alias: rest }
  if (kind === 'm') return { provider, model: rest }
  return { provider }
}

export function describeTarget(
  t: { provider: string; model?: string | null; alias?: string | null },
  instances: readonly ProviderInstance[]
): string {
  const label = instances.find((p) => p.id === t.provider)?.label ?? t.provider
  return `${label} · ${t.alias ? `alias ${t.alias}` : (t.model ?? 'modèle par défaut')}`
}

/** The current target stays visible when no catalog lists it any more. */
export const withCurrentTarget = (
  options: SearchableOption[],
  current: RoleTarget | undefined,
  instances: readonly ProviderInstance[]
): SearchableOption[] => {
  const value = encodeTarget(current)
  return !current || options.some((o) => o.value === value)
    ? options
    : [{ value, label: describeTarget(current, instances) }, ...options]
}

/** An instance whose credential sits in the vault cannot run while the vault is locked. */
export const dependsOnVault = (p: ProviderInstance | undefined): boolean =>
  !!p?.credential_ref && p.credential_ref.startsWith('vault:')

// ---------------------------------------------------------------------------
// The options
// ---------------------------------------------------------------------------

export type CatalogState = 'loading' | 'live' | 'offline'

export interface ModelTargetsOptions {
  instances: readonly ProviderInstance[]
  aliases?: readonly ModelAlias[]
  /** One `d|<provider>|` row per instance (the instance's default model). */
  withDefault?: boolean
  /** One `a|<provider>|<alias>` row per alias of the instance. */
  withAliases?: boolean
  /** An instance that cannot be chosen here, and why (shown under each of its rows). */
  disallowed?: (providerId: string) => string | undefined
}

export interface ModelTargets {
  options: SearchableOption[]
  /** The live Claude catalog: not read yet, read, or unreachable (offline). */
  catalog: CatalogState
  /** Re-read the Claude catalog and every instance catalog (after a vault unlock, a retry). */
  refresh: () => void
}

const CLAUDE = (p: ProviderInstance) => isClaudeCodeProvider(p.id, p.kind)

/** `p.models` (what the provider list carries) and the instance's own catalog, by id, list order first. */
function mergeModels(listed: readonly ProviderModel[], catalog: readonly ProviderModel[] | undefined): ProviderModel[] {
  const out = new Map<string, ProviderModel>()
  for (const m of catalog ?? []) out.set(m.id, m)
  for (const m of listed) out.set(m.id, { ...out.get(m.id), ...m })
  return [...out.values()]
}

export function useModelTargets({ instances, aliases = [], withDefault, withAliases, disallowed }: ModelTargetsOptions): ModelTargets {
  const { t } = useT()
  const claudeCatalog = useAtomValue(modelCatalogAtom)
  const claudeLoaded = useAtomValue(modelCatalogLoadedAtom)
  const setClaudeCatalog = useSetAtom(modelCatalogAtom)
  const setClaudeLoaded = useSetAtom(modelCatalogLoadedAtom)

  // The app reads the catalog at start; a settings page opened after a failed
  // start reads it again (deduped, never throws).
  useEffect(() => {
    if (!claudeLoaded) fetchModelCatalog(setClaudeCatalog, setClaudeLoaded)
  }, [claudeLoaded, setClaudeCatalog, setClaudeLoaded])

  // Instance catalogs, asked once per instance for the session (module cache).
  const [catalogs, setCatalogs] = useState<Record<string, ProviderModel[]>>({})
  const asked = useRef(new Set<string>())
  const ids = instances.filter((p) => !CLAUDE(p)).map((p) => p.id)
  const idsKey = ids.join('\n')
  const load = useCallback(
    (force: boolean) => {
      for (const id of idsKey ? idsKey.split('\n') : []) {
        if (!force && asked.current.has(id)) continue
        asked.current.add(id)
        loadModelCatalog(id, force)
          .then((models) => setCatalogs((c) => ({ ...c, [id]: models })))
          .catch(() => {
            // The instance's stored default (from the provider list) stays listed.
          })
      }
    },
    [idsKey]
  )
  useEffect(() => load(false), [load])

  const refresh = useCallback(() => {
    fetchModelCatalog(setClaudeCatalog, setClaudeLoaded)
    load(true)
  }, [load, setClaudeCatalog, setClaudeLoaded])

  const catalog: CatalogState = !claudeLoaded ? 'loading' : claudeCatalog.length === 0 ? 'offline' : 'live'
  const legacy = t('routing.modelTargets.legacy')

  const options = useMemo<SearchableOption[]>(
    () =>
      instances.flatMap((p) => {
        const note = disallowed?.(p.id)
        const blocked = !!note
        const own = withAliases ? aliases.filter((a) => a.provider === p.id) : []
        const head: SearchableOption[] = [
          ...(withDefault
            ? [{ value: `d|${p.id}|`, label: `${p.label} · modèle par défaut`, description: note, group: p.label, disabled: blocked }]
            : []),
          ...own.map((a) => ({
            value: `a|${p.id}|${a.alias}`,
            label: `${p.label} · alias ${a.alias}`,
            description: note,
            group: p.label,
            keywords: [a.model],
            disabled: blocked,
          })),
        ]
        if (CLAUDE(p) && catalog === 'live') {
          // Grouped by family, the catalog's order inside each (current lineup first).
          const rows = groupModelsByFamily(claudeCatalog).flatMap((g) =>
            g.models.map((m) => ({
              value: `m|${p.id}|${m.id}`,
              label: `${p.label} · ${m.shortLabel}`,
              description: [m.id, m.tier === 'legacy' ? legacy : null, note].filter(Boolean).join(' · '),
              group: `${p.label} · ${g.label}`,
              keywords: [m.id, m.fullLabel, g.label],
              disabled: blocked,
            }))
          )
          return [...head, ...rows]
        }
        const models = CLAUDE(p) ? p.models : mergeModels(p.models, catalogs[p.id])
        return [
          ...head,
          ...models.map((m) => ({
            value: `m|${p.id}|${m.id}`,
            label: `${p.label} · ${m.label ?? m.id}`,
            description: [modelCapabilities(m), note].filter(Boolean).join(' · ') || undefined,
            group: p.label,
            keywords: [m.id],
            disabled: blocked,
          })),
        ]
      }),
    [instances, aliases, withDefault, withAliases, disallowed, catalog, claudeCatalog, catalogs, legacy]
  )

  return { options, catalog, refresh }
}
