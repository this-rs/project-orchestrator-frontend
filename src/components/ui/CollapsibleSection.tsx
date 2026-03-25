import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent } from './Card'

export interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  description?: string
  headerRight?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  icon,
  description,
  headerRight,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          // Only toggle if the click target is NOT inside headerRight
          if (!(e.target as HTMLElement).closest('[data-header-right]')) {
            setOpen(!open)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(!open)
          }
        }}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-500 transition-transform duration-150 shrink-0 ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-gray-400 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-200">{title}</span>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
        {headerRight && (
          <div className="shrink-0" data-header-right>
            {headerRight}
          </div>
        )}
      </div>
      {open && (
        <CardContent className="pt-4 pb-5 px-5 border-t border-white/[0.06]">
          {children}
        </CardContent>
      )}
    </Card>
  )
}
