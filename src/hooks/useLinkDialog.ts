import { useState, useCallback, useRef } from 'react'

export interface LinkOption {
  value: string
  label: string
  description?: string
}

interface LinkDialogConfig {
  title: string
  submitLabel?: string
  fetchOptions: () => Promise<LinkOption[]>
  onLink: (selectedId: string) => Promise<void>
}

export function useLinkDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [submitLabel, setSubmitLabel] = useState('Link')
  const [options, setOptions] = useState<LinkOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const onLinkRef = useRef<((id: string) => Promise<void>) | null>(null)

  const openDialog = useCallback((config: LinkDialogConfig) => {
    setTitle(config.title)
    setSubmitLabel(config.submitLabel || 'Link')
    setSelectedId('')
    setSearchQuery('')
    setOptions([])
    setOpen(true)
    onLinkRef.current = config.onLink

    setFetching(true)
    config
      .fetchOptions()
      .then((opts) => setOptions(opts))
      .catch(() => setOptions([]))
      .finally(() => setFetching(false))
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    onLinkRef.current = null
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!selectedId || !onLinkRef.current) return
    setLoading(true)
    try {
      await onLinkRef.current(selectedId)
      close()
    } catch (error) {
      console.error('Link action failed:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedId, close])

  // Client-side filtering
  const filteredOptions = searchQuery
    ? options.filter((opt) => {
        const q = searchQuery.toLowerCase()
        return (
          opt.label.toLowerCase().includes(q) ||
          (opt.description && opt.description.toLowerCase().includes(q))
        )
      })
    : options

  return {
    open: openDialog,
    close,
    dialogProps: {
      open,
      onClose: close,
      title,
      submitLabel,
      options: filteredOptions,
      selectedId,
      onSelect: setSelectedId,
      onSubmit: handleSubmit,
      loading,
      fetching,
      searchQuery,
      onSearchChange: setSearchQuery,
    },
  }
}
