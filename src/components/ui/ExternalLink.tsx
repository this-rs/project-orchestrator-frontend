import type { AnchorHTMLAttributes, ReactNode, MouseEvent } from 'react'
import { isTauri } from '@/utils/openExternal'

interface ExternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string
  children: ReactNode
}

/**
 * Open a URL in the system browser via Tauri IPC.
 *
 * Uses the custom `open_url` Tauri command which calls the Opener plugin
 * from Rust. This is the most reliable approach — no plugin JS dependency,
 * no CSP issues, just a direct IPC call.
 */
async function tauriOpenUrl(url: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_url', { url })
  } catch (err) {
    console.warn('[ExternalLink] Tauri open_url failed:', err)
    // Fallback: let the browser handle it
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/**
 * A link component that works in both Tauri desktop and regular browsers.
 *
 * - **Tauri desktop**: Intercepts clicks and calls a custom Tauri command
 *   (`open_url`) that opens the URL in the system browser via the Opener
 *   plugin. The link renders without `href` to prevent WKWebView from
 *   intercepting the navigation before our click handler fires.
 *
 * - **Regular browser**: Renders a standard `<a href target="_blank">`.
 */
export function ExternalLink({ href, children, className, ...props }: ExternalLinkProps) {
  // Strip props that ReactMarkdown may pass but that are not valid HTML attributes
  const { node, inline, ordered, index: _index, siblingCount, ...htmlProps } =
    props as Record<string, unknown>
  void node; void inline; void ordered; void _index; void siblingCount

  if (!href || !/^https?:\/\//i.test(href)) {
    return (
      <a href={href} className={className} {...(htmlProps as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    )
  }

  if (isTauri()) {
    // Tauri: NO href to prevent webview navigation interception.
    // onClick calls invoke('open_url') which reliably opens in system browser.
    return (
      <a
        role="link"
        tabIndex={0}
        className={`cursor-pointer ${className ?? ''}`}
        onClick={(e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          tauriOpenUrl(href)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            tauriOpenUrl(href)
          }
        }}
        title={href}
        {...(htmlProps as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    )
  }

  // Regular browser
  return (
    <a
      {...(htmlProps as AnchorHTMLAttributes<HTMLAnchorElement>)}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  )
}
