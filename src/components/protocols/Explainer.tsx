import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

/**
 * One or two muted lines explaining an abstract concept (FSM, run, wave,
 * trigger…) in plain language, right where it is used. Always visible — no
 * tooltip — and deliberately quiet so it never competes with the data.
 */
export function Explainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-xs leading-5 text-gray-500 ${className}`}>
      <Info className="w-3.5 h-3.5 mt-[3px] shrink-0 text-gray-600" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}
