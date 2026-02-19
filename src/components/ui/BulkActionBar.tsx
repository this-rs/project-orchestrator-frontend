import { Button } from './Button'

interface BulkActionBarProps {
  count: number
  onDelete: () => void
  onClear: () => void
  deleting?: boolean
}

export function BulkActionBar({ count, onDelete, onClear, deleting }: BulkActionBarProps) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-surface-overlay border border-border-default shadow-lg rounded-xl px-3 py-2 sm:px-5 sm:py-3 flex items-center gap-3 sm:gap-4">
      <span className="text-sm text-gray-300 whitespace-nowrap">
        {count} selected
      </span>
      <button
        onClick={onClear}
        className="text-xs text-gray-400 hover:text-gray-200 transition-colors whitespace-nowrap"
      >
        Deselect
      </button>
      <Button
        size="sm"
        variant="danger"
        onClick={onDelete}
        disabled={deleting}
      >
        {deleting ? 'Deleting...' : 'Delete'}
      </Button>
    </div>
  )
}
