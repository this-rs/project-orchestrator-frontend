import { useState } from 'react'
import type { ContentBlock } from '@/types'

interface InputRequestBlockProps {
  block: ContentBlock
  onRespond: (requestId: string, response: string) => void
  disabled?: boolean
}

export function InputRequestBlock({ block, onRespond, disabled }: InputRequestBlockProps) {
  const [value, setValue] = useState('')
  const requestId = block.metadata?.request_id as string

  const handleSubmit = () => {
    if (!value.trim()) return
    onRespond(requestId, value.trim())
    setValue('')
  }

  return (
    <div className="my-2 rounded-lg bg-indigo-900/10 border border-indigo-500/20 p-3">
      <p className="text-sm text-gray-300 mb-2">{block.content}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={disabled}
          className="flex-1 px-2 py-1 text-sm bg-black/20 border border-white/[0.06] rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40"
          placeholder="Type your response..."
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="px-3 py-1 text-xs font-medium rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
