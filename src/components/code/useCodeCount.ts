import { useT, type MessageKey } from '@/i18n'

export type CodeCountKey =
  | 'file'
  | 'function'
  | 'struct'
  | 'dependent'
  | 'import'
  | 'symbol'
  | 'publicSymbol'
  | 'commit'
  | 'note'
  | 'decision'
  | 'step'
  | 'member'
  | 'keyFile'
  | 'coChange'

/** "3 files" / "1 file", in the viewer's language (singular when n is 1). */
export function useCodeCount() {
  const { t } = useT()
  return (key: CodeCountKey, n: number) => t(`code.counts.${key}.${n === 1 ? 'one' : 'other'}` as MessageKey, { n })
}

const RISK_LEVELS = ['critical', 'high', 'medium', 'low'] as const

/** A backend risk level ("critical"…"low") in the viewer's language; an unknown level is shown as is. */
export function useRiskLevelLabel() {
  const { t } = useT()
  return (level: string) =>
    (RISK_LEVELS as readonly string[]).includes(level) ? t(`code.healthTab.levels.${level as (typeof RISK_LEVELS)[number]}`) : level
}

const RECENCY = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'] as const

/** Title of a `groupByRecency` bucket ("Today", "Previous 7 days"…) in the viewer's language. */
export function useRecencyLabel() {
  const { t } = useT()
  return (group: string) =>
    (RECENCY as readonly string[]).includes(group) ? t(`code.recency.${group as (typeof RECENCY)[number]}`) : group
}
