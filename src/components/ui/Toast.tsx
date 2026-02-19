import type { ReactNode } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Check, X, Info, AlertCircle } from 'lucide-react'
import { toastMessagesAtom } from '@/atoms'

type ToastType = 'success' | 'error' | 'info' | 'warning'

const typeConfig: Record<ToastType, { bar: string; icon: ReactNode }> = {
  success: {
    bar: 'bg-green-500',
    icon: <Check className="w-5 h-5 text-green-400" />,
  },
  error: {
    bar: 'bg-red-500',
    icon: <X className="w-5 h-5 text-red-400" />,
  },
  info: {
    bar: 'bg-blue-500',
    icon: <Info className="w-5 h-5 text-blue-400" />,
  },
  warning: {
    bar: 'bg-yellow-500',
    icon: <AlertCircle className="w-5 h-5 text-yellow-400" />,
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
            className="pointer-events-auto flex items-stretch glass-medium rounded-xl shadow-md overflow-hidden animate-[slideInRight_200ms_ease-out] min-w-[300px] max-w-[420px]"
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
                <X className="w-4 h-4" />
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
