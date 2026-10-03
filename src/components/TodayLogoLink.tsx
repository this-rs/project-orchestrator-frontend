import { NavLink } from 'react-router-dom'
import { focusRing } from '@/components/ui/classes'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { AttentionBadge } from '@/components/AttentionBadge'

/** Today, the root of the application (above every workspace). */
export const GLOBAL_TODAY_PATH = '/today'

/**
 * The product logo of a menu, which IS the way to Today: one click from anywhere, with the
 * pending-request badge on its corner. It replaces the Today icon that used to sit in the
 * header. The accessible name stays "Today" (the logo image itself is decorative).
 */
export function TodayLogoLink({ className = '' }: { className?: string }) {
  return (
    <NavLink
      to={GLOBAL_TODAY_PATH}
      end
      aria-label={NOMENCLATURE.today.plural}
      title={NOMENCLATURE.today.plural}
      className={({ isActive }) =>
        `${focusRing} relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-shadow ${
          isActive ? 'ring-2 ring-indigo-400/70' : 'hover:ring-2 hover:ring-white/20'
        } ${className}`
      }
    >
      <img src="/logo-32.png" alt="" aria-hidden="true" className="h-8 w-8 rounded-lg" />
      <AttentionBadge variant="corner" />
    </NavLink>
  )
}
