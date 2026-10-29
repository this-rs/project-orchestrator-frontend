/**
 * A file dragged anywhere in the window lands in the composer — or at least
 * stops the browser from replacing the app with it.
 *
 * ## The bug this exists for
 *
 * The composer is the only element that accepts a drop. Everywhere else, the
 * browser's default takes over: dropping a screenshot on the transcript, the
 * sidebar or the header NAVIGATES to the file. In a desktop app that means the
 * whole React tree is replaced by a PNG, the conversation is gone until a
 * reload, and any draft text with it. It happens by a centimetre — the
 * composer is a thin strip at the bottom of a tall page.
 *
 * ## Why the drop is not always attached to the message
 *
 * Some pages have their own drop zones (importing a skill archive, for one).
 * Hijacking every drop in the window would attach a file to a chat the user
 * was not looking at. So the file is handed to the composer only when the drop
 * happened inside the chat panel — marked by [`CHAT_PANEL_ATTR`] — and
 * everywhere else the only thing done is `preventDefault()`: no navigation, no
 * surprise attachment.
 */
import { useEffect } from 'react'

/**
 * Marks the chat panel's root element(s).
 *
 * An attribute rather than a React context because the listener lives on
 * `window`, outside the tree, and because the panel has more than one layout
 * root (fullscreen and docked).
 */
export const CHAT_PANEL_ATTR = 'data-chat-panel'

/** Is this drag carrying files? `types` is all that is readable during a drag. */
function carriesFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes('Files')
}

function insideChatPanel(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest(`[${CHAT_PANEL_ATTR}]`) !== null
}

/**
 * Install the window-level drag guard while a composer is mounted.
 *
 * `onFiles` receives the dropped files only for a drop inside the chat panel.
 */
export function useWindowFileDrop(onFiles: (files: File[]) => void, active = true): void {
  useEffect(() => {
    if (!active) return

    // Refusing the dragover is what makes the drop event fire at all, and what
    // shows the "copy" cursor instead of the "this will open the file" one.
    const handleDragOver = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return
      event.preventDefault()
      if (!insideChatPanel(event.target)) return
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length > 0) onFiles(files)
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [onFiles, active])
}
