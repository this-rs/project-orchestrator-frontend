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
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  const open = useCallback((cfg: ConfirmConfig) => {
    setConfig(cfg)
    setProgress(null)
  }, [])

  const close = useCallback(() => {
    setConfig(null)
    setProgress(null)
  }, [])

  const dialogProps: ConfirmDialogProps = {
    open: config !== null,
    onClose: close,
    onConfirm: config?.onConfirm ?? (() => {}),
    title: config?.title ?? '',
    description: config?.description,
    confirmLabel: config?.confirmLabel,
    variant: config?.variant,
    progress,
  }

  return { open, close, setProgress, dialogProps }
}
