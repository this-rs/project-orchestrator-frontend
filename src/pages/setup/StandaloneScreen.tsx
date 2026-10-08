import type { ReactNode } from 'react'
import { HaloPointer, PageContainer, leadText, sectionTitle } from '@/components/ui'

interface StandaloneScreenProps {
  children: ReactNode
  /** `narrow` (max-w-3xl, forms — DESIGN.md § 1), `sm` (max-w-md: a short list) or `xs` (max-w-sm: a lone sign-in form). */
  width?: 'narrow' | 'sm' | 'xs'
  /** Centre the block vertically (a short screen: sign-in, callback). */
  center?: boolean
  /** Rendered under the content, outside the column (the « Made by » line). */
  footer?: ReactNode
  className?: string
}

/**
 * The full-height dark screen the app shows before `MainLayout` exists: the
 * setup assistant, sign-in, the OAuth callback, the workspace selector. It owns
 * the gutters `MainLayout` would otherwise give (16 px on phones, 24 px desktop)
 * and mounts the ONE `HaloPointer` of the screen (`MainLayout` is not rendered
 * on these routes, so there is still a single listener). No horizontal scroll:
 * the column is `min-w-0` and every child wraps.
 */
export function StandaloneScreen({ children, width = 'narrow', center = false, footer, className = '' }: StandaloneScreenProps) {
  return (
    <div className={`flex min-h-dvh w-full min-w-0 flex-col bg-surface-base px-4 text-gray-100 md:px-6 ${className}`}>
      <HaloPointer />
      <div className={`flex min-w-0 flex-1 flex-col ${center ? 'justify-center' : ''}`}>
        <PageContainer width="narrow" className={width === 'xs' ? 'max-w-sm!' : width === 'sm' ? 'max-w-md!' : ''}>
          {children}
        </PageContainer>
      </div>
      {footer && <div className="pb-6 pt-2">{footer}</div>}
    </div>
  )
}

interface ScreenHeaderProps {
  /** The one display title of the screen (`display-3`, DESIGN.md § 2). */
  title: string
  /** The lead under it: one or two sentences in the site's words. */
  lead?: ReactNode
  /** Small line above the title (the product name next to the logo). */
  kicker?: ReactNode
  /** `h1` on a page that has no other heading, `h2` under the setup chrome. */
  as?: 'h1' | 'h2'
  className?: string
}

/** Logo + product name, then the display title and its lead. Once per screen, above everything else. */
export function ScreenHeader({ title, lead, kicker, as: Tag = 'h1', className = '' }: ScreenHeaderProps) {
  return (
    <header className={`min-w-0 ${className}`}>
      {kicker && <div className="mb-4 flex items-center gap-2.5 text-sm text-gray-400">{kicker}</div>}
      <Tag className={`${sectionTitle} break-words`}>{title}</Tag>
      {lead && <p className={`mt-3 ${leadText}`}>{lead}</p>}
    </header>
  )
}

/** The product's mark and name, for `ScreenHeader.kicker`. */
export function ProductMark({ name = 'Project Orchestrator' }: { name?: string }) {
  return (
    <>
      <img src="/logo-32.png" alt="" aria-hidden="true" className="h-7 w-7 rounded-lg" />
      <span className="font-medium text-gray-300">{name}</span>
    </>
  )
}
