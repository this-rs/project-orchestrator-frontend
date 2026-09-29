/**
 * BudgetEditor — `$1.23 / $10.00` with an always-visible "Edit" control that
 * turns into an inline number field (Enter saves, Esc cancels).
 */

import { useCallback, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Button, focusRing, hitArea, textLink } from '@/components/ui'
import { formatCost } from './shared'

interface BudgetEditorProps {
  costUsd: number
  maxCostUsd: number
  onSave: (value: number) => Promise<void>
}

export function BudgetEditor({ costUsd, maxCostUsd, onSave }: BudgetEditorProps) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  const start = useCallback(() => {
    setInput(String(maxCostUsd || Math.ceil(costUsd * 2) || 10))
    setEditing(true)
  }, [maxCostUsd, costUsd])

  const save = useCallback(async () => {
    const value = parseFloat(input)
    if (isNaN(value) || value <= 0) return
    setSaving(true)
    try {
      await onSave(value)
      setEditing(false)
    } catch {
      // the polled snapshot will show the real value
    } finally {
      setSaving(false)
    }
  }, [input, onSave])

  if (editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="font-mono tabular-nums text-gray-300">{formatCost(costUsd)} /</span>
        <label className="inline-flex items-center gap-1">
          <span className="text-gray-500">$</span>
          <span className="sr-only">Budget limit in dollars</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={500}
            step={5}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') setEditing(false)
            }}
            autoFocus
            className={`w-20 h-9 md:h-8 px-2 rounded-md bg-white/[0.05] border border-white/[0.1] text-base md:text-sm font-mono tabular-nums text-gray-200 ${focusRing}`}
          />
        </label>
        <Button size="sm" variant="secondary" onClick={() => void save()} loading={saving} aria-label="Save budget" className="!px-2">
          {!saving && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel budget edit" className="!px-2">
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      </span>
    )
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span className="font-mono tabular-nums">
        {formatCost(costUsd)}
        {maxCostUsd > 0 && <span className="text-gray-500"> / {formatCost(maxCostUsd)}</span>}
      </span>
      <button type="button" onClick={start} className={`${hitArea} inline-flex items-center gap-1 text-xs ${textLink}`}>
        <Pencil className="w-3 h-3" aria-hidden="true" />
        {maxCostUsd > 0 ? 'Edit budget' : 'Set budget'}
      </button>
    </span>
  )
}
