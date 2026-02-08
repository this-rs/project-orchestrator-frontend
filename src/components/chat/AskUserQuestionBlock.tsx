import { useState, useCallback } from 'react'
import type { ContentBlock, AskUserQuestion } from '@/types'

interface AskUserQuestionBlockProps {
  block: ContentBlock
  onRespond: (requestId: string, response: string) => void
  disabled?: boolean
}

export function AskUserQuestionBlock({ block, onRespond, disabled }: AskUserQuestionBlockProps) {
  const questions = (block.metadata?.questions as AskUserQuestion[]) || []
  const [selections, setSelections] = useState<Map<number, Set<number>>>(() => new Map())
  const [freeText, setFreeText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const toggleOption = useCallback((questionIndex: number, optionIndex: number, multiSelect: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev)
      const current = next.get(questionIndex) || new Set<number>()

      if (multiSelect) {
        // Checkbox: toggle
        const updated = new Set(current)
        if (updated.has(optionIndex)) {
          updated.delete(optionIndex)
        } else {
          updated.add(optionIndex)
        }
        next.set(questionIndex, updated)
      } else {
        // Radio: clear and set
        next.set(questionIndex, new Set([optionIndex]))
      }

      return next
    })
  }, [])

  const formatResponse = useCallback(() => {
    const lines: string[] = []

    questions.forEach((q, qIndex) => {
      const selected = selections.get(qIndex) || new Set()
      const labels = Array.from(selected)
        .map((optIndex) => q.options[optIndex]?.label)
        .filter(Boolean)

      if (labels.length > 0) {
        if (questions.length === 1) {
          // Single question: just the labels
          lines.push(labels.join(', '))
        } else {
          // Multiple questions: prefix with header or question
          const prefix = q.header || q.question
          lines.push(`${prefix}: ${labels.join(', ')}`)
        }
      }
    })

    // Add free text if provided
    if (freeText.trim()) {
      lines.push(freeText.trim())
    }

    return lines.join('\n')
  }, [questions, selections, freeText])

  const handleSubmit = useCallback(() => {
    const response = formatResponse()
    if (!response) return

    setSubmitted(true)
    const toolCallId = (block.metadata?.tool_call_id as string) || block.id
    onRespond(toolCallId, response)
  }, [formatResponse, onRespond, block.id, block.metadata?.tool_call_id])

  // Check if at least one option is selected or free text is provided
  const hasSelection = Array.from(selections.values()).some((set) => set.size > 0) || freeText.trim().length > 0
  const isDisabled = disabled || submitted

  if (questions.length === 0) {
    // Fallback to content
    return (
      <div className="my-2 rounded-lg bg-indigo-900/10 border border-indigo-500/20 p-3">
        <p className="text-sm text-gray-300">{block.content}</p>
      </div>
    )
  }

  return (
    <div className="my-2 rounded-lg bg-indigo-900/10 border border-indigo-500/20 p-3 space-y-4">
      {questions.map((q, qIndex) => {
        const selected = selections.get(qIndex) || new Set()

        return (
          <div key={qIndex} className="space-y-2">
            {/* Header chip + Question */}
            <div className="flex items-start gap-2">
              {q.header && (
                <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded bg-indigo-600/30 text-indigo-300">
                  {q.header}
                </span>
              )}
              <p className="text-sm text-gray-200">{q.question}</p>
            </div>

            {/* Options */}
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt, optIndex) => {
                const isSelected = selected.has(optIndex)

                return (
                  <button
                    key={optIndex}
                    onClick={() => toggleOption(qIndex, optIndex, q.multiSelect)}
                    disabled={isDisabled}
                    className={`
                      group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors
                      ${isSelected
                        ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300'
                        : 'bg-white/[0.03] border border-white/[0.06] text-gray-300 hover:bg-white/[0.06]'
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    {/* Radio/Checkbox indicator */}
                    <span className={`
                      w-3.5 h-3.5 flex items-center justify-center border transition-colors
                      ${q.multiSelect ? 'rounded-sm' : 'rounded-full'}
                      ${isSelected
                        ? 'border-indigo-500 bg-indigo-600'
                        : 'border-gray-500 group-hover:border-gray-400'
                      }
                    `}>
                      {isSelected && (
                        q.multiSelect ? (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                            <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                          </svg>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )
                      )}
                    </span>
                    <span className="flex flex-col items-start">
                      <span>{opt.label}</span>
                      {opt.description && (
                        <span className="text-xs text-gray-500">{opt.description}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Free text input + Submit button */}
      {!submitted && (
        <div className="flex gap-2 pt-2">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && hasSelection && handleSubmit()}
            disabled={isDisabled}
            placeholder="Ou tapez votre réponse..."
            className="flex-1 px-3 py-1.5 text-sm bg-black/20 border border-white/[0.06] rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40"
          />
          <button
            onClick={handleSubmit}
            disabled={isDisabled || !hasSelection}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </div>
      )}

      {/* Submitted summary */}
      {submitted && (
        <div className="pt-2 border-t border-white/[0.06]">
          <p className="text-xs text-gray-500">
            Responded: <span className="text-gray-400">{formatResponse()}</span>
          </p>
        </div>
      )}
    </div>
  )
}
