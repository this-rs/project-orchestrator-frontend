import { ShieldAlert } from 'lucide-react'
import { POLICY_ONLY_DETAIL, POLICY_ONLY_TEXT } from '@/constants/capabilities'

/**
 * Shown above the composer when the provider cannot pause a tool call to ask:
 * there will be no Allow / Deny prompt, the tool policy decides alone.
 */
export function PolicyOnlyBanner() {
  return (
    <div
      role="note"
      data-testid="policy-only-banner"
      className="mx-3 mb-1 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200"
    >
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <p className="min-w-0">
        <span className="font-medium text-amber-100">{POLICY_ONLY_TEXT}</span>{' '}
        <span className="text-amber-200/80">{POLICY_ONLY_DETAIL}</span>
      </p>
    </div>
  )
}
