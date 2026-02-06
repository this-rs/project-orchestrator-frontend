import { useState, useCallback } from 'react'
import type { ConfirmDialogProps } from '@/components/ui/ConfirmDialog'

interface ConfirmConfig {
  title: string
  description?: string
  confirmLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => Promise<void>
}

export function useConfirmDialog() {
  const [config, setConfig] = useState<ConfirmConfig | null>(null)

  const open = useCallback((cfg: ConfirmConfig) => {
    setConfig(cfg)
  }, [])

  const close = useCallback(() => {
    setConfig(null)
  }, [])

  const dialogProps: ConfirmDialogProps = {
    open: config !== null,
    onClose: close,
    onConfirm: config?.onConfirm ?? (() => {}),
    title: config?.title ?? '',
    description: config?.description,
    confirmLabel: config?.confirmLabel,
    variant: config?.variant,
  }

  return { open, close, dialogProps }
}
