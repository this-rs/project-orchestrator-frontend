import { useCallback, useState, useRef, useEffect } from 'react'
import { isTauri } from '@/services/env'

/**
 * Auto-hiding custom titlebar for Tauri desktop.
 *
 * Hidden by default. A thin invisible hover zone at the top of the screen
 * triggers the titlebar to slide in. It stays visible while hovered,
 * then slides out after the cursor leaves.
 *
 * Uses `data-tauri-drag-region` so the bar acts as a window drag handle.
 * Provides macOS-style traffic light buttons (close, minimize, fullscreen).
 */
export function TitleBar() {
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    setVisible(true)
  }, [])

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), 300)
  }, [])

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  const handleClose = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  }, [])

  const handleMinimize = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().minimize()
  }, [])

  const handleToggleFullscreen = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    const isFs = await win.isFullscreen()
    await win.setFullscreen(!isFs)
  }, [])

  const handleDoubleClickMaximize = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    const maximized = await win.isMaximized()
    if (maximized) {
      await win.unmaximize()
    } else {
      await win.maximize()
    }
  }, [])

  if (!isTauri) return null

  return (
    <>
      {/* Invisible hover trigger zone — always present at top */}
      <div
        className="fixed left-0 right-0 top-0 z-[9999] h-1"
        onMouseEnter={show}
      />

      {/* Titlebar — slides in/out */}
      <div
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        data-tauri-drag-region
        className={`fixed left-0 right-0 top-0 z-[9998] flex h-7 select-none items-center bg-surface-base/90 pl-2 backdrop-blur-sm transition-all duration-200 ${
          visible
            ? 'translate-y-0 opacity-100'
            : '-translate-y-full opacity-0'
        }`}
        onDoubleClick={handleDoubleClickMaximize}
      >
        {/* macOS-style traffic lights */}
        <div className="flex items-center gap-[6px]">
          <TrafficLight color="#ff5f57" hoverColor="#e0443e" onClick={handleClose} title="Close">
            <svg className="h-[6px] w-[6px]" viewBox="0 0 6 6" stroke="currentColor" strokeWidth="1.2">
              <line x1="0.5" y1="0.5" x2="5.5" y2="5.5" />
              <line x1="5.5" y1="0.5" x2="0.5" y2="5.5" />
            </svg>
          </TrafficLight>
          <TrafficLight color="#febc2e" hoverColor="#dea123" onClick={handleMinimize} title="Minimize">
            <svg className="h-[6px] w-[6px]" viewBox="0 0 6 6" stroke="currentColor" strokeWidth="1.2">
              <line x1="0.5" y1="3" x2="5.5" y2="3" />
            </svg>
          </TrafficLight>
          <TrafficLight
            color="#28c840"
            hoverColor="#1aab29"
            onClick={handleToggleFullscreen}
            title="Fullscreen"
          >
            <svg className="h-[6px] w-[6px]" viewBox="0 0 6 6" fill="currentColor">
              <polygon points="0.5,3 3,0.5 5.5,3 3,5.5" />
            </svg>
          </TrafficLight>
        </div>

        {/* Spacer — draggable via parent data-tauri-drag-region */}
        <div data-tauri-drag-region className="flex-1 self-stretch" />
      </div>
    </>
  )
}

function TrafficLight({
  color,
  hoverColor,
  onClick,
  title,
  children,
}: {
  color: string
  hoverColor: string
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title={title}
      className="group flex h-3 w-3 items-center justify-center rounded-full transition-colors"
      style={{ backgroundColor: color }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.backgroundColor = hoverColor
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.backgroundColor = color
      }}
    >
      <span className="text-black/60 opacity-0 group-hover:opacity-100">{children}</span>
    </button>
  )
}
