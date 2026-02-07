import { useCallback } from 'react'
import { useSetAtom } from 'jotai'
import { toastMessagesAtom } from '@/atoms'

type ToastMessage = { id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string }

export function useToast() {
  const set = useSetAtom(toastMessagesAtom)

  const show = useCallback(
    (type: ToastMessage['type'], message: string) => {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      set((prev: ToastMessage[]) => [...prev, { id, type, message }])
      setTimeout(() => {
        set((prev: ToastMessage[]) => prev.filter((t) => t.id !== id))
      }, 4000)
    },
    [set],
  )

  return {
    success: useCallback((msg: string) => show('success', msg), [show]),
    error: useCallback((msg: string) => show('error', msg), [show]),
    info: useCallback((msg: string) => show('info', msg), [show]),
    warning: useCallback((msg: string) => show('warning', msg), [show]),
  }
}
