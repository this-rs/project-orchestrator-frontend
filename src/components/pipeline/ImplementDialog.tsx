import { useState } from 'react'
import { Rocket, AlertTriangle, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useT } from '@/i18n'
import { RunTargetPicker } from '@/components/runner/RunTargetPicker'
import { useRunTarget } from '@/hooks/useRunTarget'
import {
  runBudgetTokensHelp,
  runBudgetTokensLabel,
  RUN_BUDGET_USD_DISABLED_ID,
  runTargetNoPriceText,
  hasKnownPrice,
} from '@/constants/runProviders'
import type { StartRunOptions } from '@/services/runner'
export type ImplementMode = 'plan' | 'task' | 'milestone'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ImplementDialogProps {
  /** Whether the dialog is visible */
  open: boolean
  /** Close the dialog */
  onClose: () => void
  /**
   * Confirm and launch implementation. The USD budget is `undefined` when the
   * chosen provider has no price (a token budget is in `options` instead);
   * `options` carries only what was chosen (provider, model, token budget).
   */
  onConfirm: (maxCostUsd: number | undefined, options: StartRunOptions) => void
  /** What kind of entity is being implemented */
  mode: ImplementMode
  /** Human-readable name of the entity */
  entityTitle: string
  /** Whether the confirm action is in progress */
  loading?: boolean
  /** Default budget in USD (defaults to 10) */
  defaultBudget?: number
  /** Project of the entity being launched: consent is checked for it, not for the chat's project. */
  projectSlug?: string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Confirmation dialog before launching a pipeline execution.
 * Shows a warning about resource usage and asks for confirmation.
 */
export function ImplementDialog({
  open,
  onClose,
  onConfirm,
  mode,
  entityTitle,
  loading = false,
  defaultBudget = 10,
  projectSlug,
}: ImplementDialogProps) {
  const { t } = useT()
  const [budget, setBudget] = useState<number>(defaultBudget)
  const [tokenBudget, setTokenBudget] = useState<number>(1_000_000)
  const target = useRunTarget(projectSlug)
  // Said before launch, not after a refusal: no price, no USD budget.
  const usdDisabled = target.visible && !hasKnownPrice(target.instance)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-[#1a1a2e] border border-white/[0.08] rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <Rocket className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-100">
              {t(`pipeline.implement.title.${mode}` as const)}
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              {t('pipeline.implement.subtitle')}
            </p>
          </div>
        </div>

        {/* Entity info */}
        <div className="p-3 bg-white/[0.04] rounded-lg">
          <p className="text-sm text-gray-300 font-medium truncate">{entityTitle}</p>
          <p className="text-xs text-gray-500 mt-1">
            {t(`pipeline.implement.hint.${mode}` as const)}
          </p>
        </div>

        <RunTargetPicker target={target} />

        {/* Budget configuration */}
        <div className="p-3 bg-white/[0.04] rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-gray-300">{t('pipeline.implement.budgetLimit')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              max={500}
              step={5}
              value={budget}
              disabled={usdDisabled}
              aria-label={t('pipeline.implement.budgetAria')}
              aria-describedby={usdDisabled ? RUN_BUDGET_USD_DISABLED_ID : undefined}
              onChange={(e) => setBudget(Math.max(1, Number(e.target.value)))}
              className="w-24 px-3 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-base md:text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 disabled:opacity-40"
            />
            <span className="text-sm text-gray-400">USD</span>
            <div className="flex-1 basis-2" />
            {[10, 25, 50, 100].map((preset) => (
              <Button
                key={preset}
                size="sm"
                flat
                variant={budget === preset ? 'secondary' : 'ghost'}
                aria-pressed={budget === preset}
                disabled={usdDisabled}
                onClick={() => setBudget(preset)}
                className="px-2 text-xs tabular-nums"
              >
                ${preset}
              </Button>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {t('pipeline.implement.budgetHelp')}
          </p>
          {usdDisabled && (
            <div className="space-y-1.5 pt-1">
              <p id={RUN_BUDGET_USD_DISABLED_ID} className="text-xs text-amber-300">
                {runTargetNoPriceText()}
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <span>{runBudgetTokensLabel()}</span>
                <input
                  type="number"
                  min={1000}
                  step={100000}
                  value={tokenBudget}
                  aria-describedby="run-budget-tokens-help"
                  onChange={(e) => setTokenBudget(Math.max(1000, Number(e.target.value)))}
                  className="w-32 px-3 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                />
              </label>
              <p id="run-budget-tokens-help" className="text-xs text-gray-500">
                {runBudgetTokensHelp()}
              </p>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-300">
            {t('pipeline.implement.warning')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            {t('pipeline.implement.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              onConfirm(usdDisabled ? undefined : budget, usdDisabled ? { ...target.options, maxTokens: tokenBudget } : target.options)
            }
            loading={loading}
          >
            <Rocket className="w-4 h-4 mr-1.5" />
            {t('pipeline.implement.launch')}
          </Button>
        </div>
      </div>
    </div>
  )
}
