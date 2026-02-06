import type { ReactNode } from 'react'

interface PageShellProps {
  title: string
  description?: string
  actions?: ReactNode
  filters?: ReactNode
  children: ReactNode
}

export function PageShell({ title, description, actions, filters, children }: PageShellProps) {
  return (
    <div className="pt-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-100">{title}</h1>
          {description && <p className="text-gray-400 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {filters && <div className="mb-6">{filters}</div>}
      {children}
    </div>
  )
}
