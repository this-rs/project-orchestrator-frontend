import { List, Columns3 } from 'lucide-react'
import { iconButton } from './classes'
import { useT } from '@/i18n'

export type ViewMode = 'list' | 'kanban'

interface ViewToggleProps {
  value: ViewMode
  onChange: (view: ViewMode) => void
  className?: string
}

/**
 * Icon-only list / board switch for the `FilterBar.trailing` slot (fits a
 * 375px phone next to the search). 36px targets, labelled buttons. Each item
 * is a ghost glass icon button (`iconButton`, styles/buttons.css); the pressed
 * one is `aria-pressed` and gets the same light fill the recipe gives an open
 * ghost button.
 */
export function ViewToggle({ value, onChange, className = '' }: ViewToggleProps) {
  const { t } = useT()
  const item = (mode: ViewMode, label: string, Icon: typeof List) => {
    const active = value === mode
    return (
      <button
        type="button"
        onClick={() => onChange(mode)}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={`${iconButton('ghost', 'size-9 md:size-8')} ${active ? 'text-gray-100 bg-white/[0.08]' : 'text-gray-500'}`}
      >
        <Icon className="w-4 h-4" aria-hidden="true" />
      </button>
    )
  }
  return (
    <div
      role="group"
      aria-label={t('ui.viewToggle.mode')}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {item('list', t('ui.viewToggle.list'), List)}
      {item('kanban', t('ui.viewToggle.board'), Columns3)}
    </div>
  )
}
