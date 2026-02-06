import type { ReactNode } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toastMessagesAtom } from '@/atoms'

type ToastType = 'success' | 'error' | 'info' | 'warning'

const typeConfig: Record<ToastType, { bar: string; icon: ReactNode }> = {
  success: {
    bar: 'bg-green-500',
    icon: (
      <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  error: {
    bar: 'bg-red-500',
    icon: (
      <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
  info: {
    bar: 'bg-blue-500',
    icon: (
      <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    bar: 'bg-yellow-500',
    icon: (
      <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
}

export function ToastContainer() {
  const messages = useAtomValue(toastMessagesAtom)
  const setMessages = useSetAtom(toastMessagesAtom)

  if (messages.length === 0) return null

  const dismiss = (id: string) => {
    setMessages((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
      {messages.map((toast) => {
        const config = typeConfig[toast.type]
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-stretch bg-[#232733] rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/[0.06] overflow-hidden animate-[slideInRight_200ms_ease-out] min-w-[300px] max-w-[420px]"
          >
            {/* Color bar */}
            <div className={`w-1 shrink-0 ${config.bar}`} />

            {/* Content */}
            <div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0">
              <div className="shrink-0">{config.icon}</div>
              <p className="text-sm text-gray-200 flex-1 min-w-0">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5">
              <div
                className={`h-full ${config.bar} opacity-40 animate-[shrinkWidth_4s_linear_forwards]`}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
