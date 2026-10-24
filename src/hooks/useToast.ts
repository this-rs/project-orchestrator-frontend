import { useCallback } from 'react'
import { useSetAtom } from 'jotai'
import { toastMessagesAtom, type ToastAction } from '@/atoms'

type ToastMessage = { id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string; action?: ToastAction }

export function useToast() {
  const set = useSetAtom(toastMessagesAtom)

  const show = useCallback(
    (type: ToastMessage['type'], message: string, action?: ToastAction) => {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      set((prev: ToastMessage[]) => [...prev, { id, type, message, action }])
      setTimeout(() => {
        set((prev: ToastMessage[]) => prev.filter((t) => t.id !== id))
      }, 4000)
    },
    [set],
  )

  return {
    success: useCallback((msg: string, action?: ToastAction) => show('success', msg, action), [show]),
    error: useCallback((msg: string, action?: ToastAction) => show('error', msg, action), [show]),
    info: useCallback((msg: string, action?: ToastAction) => show('info', msg, action), [show]),
    warning: useCallback((msg: string, action?: ToastAction) => show('warning', msg, action), [show]),
  }
}
