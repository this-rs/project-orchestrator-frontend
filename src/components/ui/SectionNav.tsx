import type { ReactNode } from 'react'

interface Section {
  id: string
  label: string
  count?: number
}

interface SectionNavProps {
  sections: Section[]
  activeSection: string
  rightContent?: ReactNode
}

export function SectionNav({ sections, activeSection, rightContent }: SectionNavProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="sticky top-0 z-10 bg-surface-raised/90 backdrop-blur-sm border-b border-border-subtle -mx-4 px-4 md:-mx-6 md:px-6 mb-6">
      <div className="flex items-center justify-between gap-4">
        <nav className="flex gap-1 overflow-x-auto">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollTo(section.id)}
              className={`px-2 py-2 text-xs md:px-3 md:py-2.5 md:text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeSection === section.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {section.label}
              {section.count !== undefined && (
                <span className="ml-1.5 text-gray-500">({section.count})</span>
              )}
            </button>
          ))}
        </nav>
        {rightContent && (
          <div className="shrink-0">{rightContent}</div>
        )}
      </div>
    </div>
  )
}
