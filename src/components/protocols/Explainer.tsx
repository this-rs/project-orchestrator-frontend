import type { ReactNode } from 'react'
import { focusRing } from '@/components/ui'

/**
 * « Under the hood » — the technical reading of a screen (FSM, waves, triggers,
 * Louvain…), folded under the plain-language intro (`ConceptIntro`, DESIGN.md § 5).
 * A `<details>` closed by default: the first level of a page speaks the site's
 * words, the terms live one click away. No icon, no badge — same voice as the intro.
 */
export function Explainer({ children, className = '', summary = 'Under the hood' }: { children: ReactNode; className?: string; summary?: string }) {
  return (
    <details className={`group/hood text-sm ${className}`}>
      <summary
        className={`inline-flex min-h-9 cursor-pointer list-none items-center rounded text-gray-500 underline-offset-4 hover:text-gray-300 hover:underline group-open/hood:text-gray-300 [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        {summary}
      </summary>
      <p className="mt-1 max-w-[var(--measure-md)] text-xs leading-5 text-gray-400">{children}</p>
    </details>
  )
}
