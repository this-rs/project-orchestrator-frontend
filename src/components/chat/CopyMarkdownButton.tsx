import { useCallback, useState } from 'react'
import { ClipboardCopy, Check } from 'lucide-react'

interface CopyMarkdownButtonProps {
  /**
   * Lazy markdown getter — only invoked at click time.
   * This avoids serializing message bodies on every render.
   */
  getMarkdown: () => string
  /** Tooltip when idle. Default: "Copy as markdown" */
  title?: string
  /** Tailwind classes appended to the button (positioning, size, etc.) */
  className?: string
  /** Optional aria-label override (defaults to `title`) */
  ariaLabel?: string
}

/**
 * Per-message "Copy as Markdown" button.
 *
 * - Click writes the markdown to the clipboard via `navigator.clipboard`.
 * - On success: icon flips to a check for 2s.
 * - On failure (insecure context, no clipboard API): falls back to a popup
 *   window with the markdown as a `<pre>` block — same UX as the chat-wide
 *   export in ChatPanel.
 */
export function CopyMarkdownButton({
  getMarkdown,
  title = 'Copy as markdown',
  className = '',
  ariaLabel,
}: CopyMarkdownButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      const markdown = getMarkdown()
      try {
        await navigator.clipboard.writeText(markdown)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // Fallback for non-secure contexts (no clipboard API): open popup.
        const win = window.open('', '_blank')
        if (win) {
          win.document.write(
            `<pre style="white-space:pre-wrap;font-family:monospace;padding:16px">${markdown.replace(/</g, '&lt;')}</pre>`,
          )
          win.document.title = 'Message Markdown'
        }
      }
    },
    [getMarkdown],
  )

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`p-1 rounded transition-colors ${
        copied
          ? 'text-emerald-400'
          : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
      } ${className}`}
      title={copied ? 'Copied!' : title}
      aria-label={ariaLabel ?? title}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
    </button>
  )
}
