import type { ReactNode } from 'react'
import type { ConceptExplain, ConceptKey } from '@/constants/nomenclature'
import { ConceptIntro } from './ConceptIntro'

type PageWidth = 'full' | 'wide' | 'narrow'

const WIDTHS: Record<PageWidth, string> = {
  full: '',
  wide: 'max-w-5xl mx-auto',
  narrow: 'max-w-3xl mx-auto',
}

interface PageContainerProps {
  /** `full` (kanban, graphs, dashboards), `wide` (lists, detail pages — recommended), `narrow` (forms, settings). */
  width?: PageWidth
  className?: string
  children: ReactNode
}

/**
 * Outer wrapper for any page: consistent top/bottom spacing and max width.
 * The 16px mobile / 24px desktop side gutters come from MainLayout — never
 * add horizontal padding here.
 */
export function PageContainer({ width = 'full', className = '', children }: PageContainerProps) {
  return <div className={`w-full pt-4 md:pt-6 pb-10 ${WIDTHS[width]} ${className}`}>{children}</div>
}

interface PageShellProps {
  title: string
  description?: string
  /** Primary page action(s), e.g. one `<Button size="sm">New task</Button>`. */
  actions?: ReactNode
  /** Toolbar under the header — typically a <FilterBar/>. */
  filters?: ReactNode
  /** Total item count, shown muted next to the title. */
  count?: number
  /**
   * The three sentences that introduce the screen (DESIGN.md § 5 « Explaining a concept »):
   * a registry key (`"plans"` → `NOMENCLATURE.plans.explain`) or an inline `ConceptExplain`.
   * Rendered by `ConceptIntro` under the title, folded by default.
   */
  intro?: ConceptKey | ConceptExplain
  width?: PageWidth
  children: ReactNode
}

/**
 * List / index page layout: title (+ count) and primary action on one line,
 * optional description (hidden on phones), intro (folded), toolbar, content.
 */
export function PageShell({ title, description, actions, filters, count, intro, width = 'full', children }: PageShellProps) {
  return (
    <PageContainer width={width}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3 md:mb-4">
        <div className="min-w-0 flex-[1_1_12rem]">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-100 break-words">
            {title}
            {count !== undefined && (
              <span className="ml-2 align-middle text-sm font-normal tabular-nums text-gray-500">{count}</span>
            )}
          </h1>
          {description && <p className="hidden sm:block mt-0.5 text-sm text-gray-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">{actions}</div>}
      </header>
      {intro && <ConceptIntro concept={intro} className="-mt-2 mb-3 md:-mt-3 md:mb-4" />}
      {filters && <div className="mb-3 md:mb-4">{filters}</div>}
      {children}
    </PageContainer>
  )
}
