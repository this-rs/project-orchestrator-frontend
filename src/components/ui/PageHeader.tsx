import { useEffect, type ReactNode } from 'react'
import { Link, useInRouterContext, useLocation } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { breadcrumbTitleAtom } from '@/atoms/ui'
import type { LucideIcon } from 'lucide-react'
import type { ConceptExplain, ConceptKey } from '@/constants/nomenclature'
import { ConceptIntro } from './ConceptIntro'
import type { OverflowMenuAction } from './OverflowMenu'
import { OverflowMenu } from './OverflowMenu'
import { CollapsibleMarkdown } from './CollapsibleMarkdown'
import { MetaLine } from './MetaLine'
import { inlineLink } from './classes'

export interface ParentLink {
  icon: LucideIcon
  label: string   // e.g. "Plan", "Project"
  name: string    // e.g. "Authentication Flow"
  href: string    // workspace-scoped path
}

interface PageHeaderProps {
  title: string
  description?: string
  /** Status control / text — rendered first on the key-facts line (e.g. <StatusMenu/>). */
  status?: ReactNode
  /** Key facts line items (joined with `·`): priority, dates, counts, owner… */
  meta?: ReactNode[]
  /** Legacy label/value pairs — rendered on the key-facts line as `label value`. */
  metadata?: { label: string; value: string | ReactNode }[]
  /** Primary action(s): at most one primary <Button size="sm"/> + one secondary. */
  actions?: ReactNode
  /** Secondary actions in the `⋯` menu (edit, delete with `confirm`…). */
  overflowActions?: OverflowMenuAction[]
  /** Extra row under the key facts (tags, linked entities…). */
  children?: ReactNode
  /** Parent entities, shown as a muted breadcrumb line above the title */
  parentLinks?: ParentLink[]
  /** view-transition-name for shared element morph (title ↔ card title) */
  viewTransitionName?: string
  /**
   * The three sentences that introduce this kind of screen (DESIGN.md § 5): a registry key or an
   * inline `ConceptExplain`, rendered folded under the key-facts line. Optional — most detail pages
   * inherit the explanation from their list page.
   */
  intro?: ConceptKey | ConceptExplain
}

/**
 * Publishes the page title to the breadcrumb so it can name the entity
 * instead of showing its id. Renders nothing; lives in its own component so
 * PageHeader itself still works outside a Router.
 */
function BreadcrumbTitle({ title }: { title: string }) {
  const { pathname } = useLocation()
  const setBreadcrumbTitle = useSetAtom(breadcrumbTitleAtom)
  useEffect(() => {
    setBreadcrumbTitle({ pathname, title })
    return () => setBreadcrumbTitle((cur) => (cur?.pathname === pathname ? null : cur))
  }, [pathname, title, setBreadcrumbTitle])
  return null
}

/**
 * Detail-page header:
 *
 * ```
 * ⌂ Project name  ›  ▤ Plan name                 (parents, muted links)
 * Title that may wrap on two lines          [Action] [⋯]
 * ● In progress · P8 · Updated 3h · 4 tasks      (key facts, MetaLine)
 * What is this?                                  (intro, folded — optional)
 * description (collapsible markdown)
 * children (tags…)
 * ```
 *
 * On phones the `⋯` stays on the title line and the action buttons wrap
 * under the title — nothing is squeezed or truncated.
 */
export function PageHeader({
  title,
  description,
  status,
  meta,
  metadata,
  actions,
  overflowActions,
  children,
  parentLinks,
  viewTransitionName,
  intro,
}: PageHeaderProps) {
  const facts: ReactNode[] = [
    status,
    ...(meta ?? []),
    ...(metadata ?? []).map((item) => (
      <span key={`md-${item.label}`} className="inline-flex items-baseline gap-1 min-w-0">
        <span className="text-gray-500">{item.label}</span>
        <span className="text-gray-300 min-w-0 break-words">{item.value}</span>
      </span>
    )),
  ]
  const inRouter = useInRouterContext()

  const hasOverflow = overflowActions && overflowActions.some((a) => !a.hidden)

  return (
    <header className="space-y-2">
      {inRouter && <BreadcrumbTitle title={title} />}
      {parentLinks && parentLinks.length > 0 && (
        <nav aria-label="Parent entities" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {parentLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={`${link.label}-${link.href}`}
                to={link.href}
                title={`${link.label}: ${link.name}`}
                aria-label={`${link.label}: ${link.name}`}
                className={`inline-flex items-center gap-1 min-w-0 max-w-full py-1 ${inlineLink}`}
              >
                <Icon className="w-3 h-3 shrink-0 text-gray-500" aria-hidden="true" />
                <span className="truncate max-w-[14rem] sm:max-w-[20rem]">{link.name}</span>
              </Link>
            )
          })}
        </nav>
      )}

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 flex flex-wrap items-start gap-x-3 gap-y-2">
          <h1
            className="min-w-0 flex-[1_1_16rem] text-xl md:text-2xl font-semibold tracking-tight text-gray-100 break-words"
            style={viewTransitionName ? { viewTransitionName } : undefined}
          >
            {title}
          </h1>
          {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
        </div>
        {hasOverflow && <OverflowMenu actions={overflowActions} label={`Actions for ${title}`} className="-mr-1.5" />}
      </div>

      <MetaLine size="sm" items={facts} />

      {intro && <ConceptIntro concept={intro} />}

      {description && <CollapsibleMarkdown content={description} maxHeight={120} />}

      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}
