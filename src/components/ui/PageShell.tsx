import type { ReactNode } from 'react'

interface PageShellProps {
  title: string
  description?: string
  actions?: ReactNode
  filters?: ReactNode
  children: ReactNode
  /** data-tour attribute placed on the page header (title + actions row) */
  dataTour?: string
}

export function PageShell({ title, description, actions, filters, children, dataTour }: PageShellProps) {
  return (
    <div className="pt-6">
      <div data-tour={dataTour} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-100">{title}</h1>
          {description && <p className="text-gray-400 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {filters && <div className="mb-6">{filters}</div>}
      {children}
    </div>
  )
}
