import { useState, useCallback } from 'react'

interface FormDialogState {
  open: boolean
  title: string
  submitLabel?: string
  size?: 'sm' | 'md' | 'lg'
}

interface OpenConfig {
  title: string
  submitLabel?: string
  size?: 'sm' | 'md' | 'lg'
}

export function useFormDialog() {
  const [state, setState] = useState<FormDialogState>({
    open: false,
    title: '',
  })

  const open = useCallback((config: OpenConfig) => {
    setState({ open: true, ...config })
  }, [])

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }))
  }, [])

  return {
    open,
    close,
    isOpen: state.open,
    dialogProps: {
      open: state.open,
      onClose: close,
      title: state.title,
      submitLabel: state.submitLabel,
      size: state.size,
    },
  }
}
