import { useT } from '@/i18n'
import type { AnchorNotice } from '@/hooks/useAnchors'
import { MAX_FOCUS_ANCHORS } from '@/services/anchors'
import { anchorName } from './anchorNames'

/** The sentence a notice reads as. */
export function useAnchorNoticeText(): (notice: AnchorNotice | null) => string {
  const { t } = useT()
  return (notice) => {
    if (!notice) return ''
    switch (notice.kind) {
      case 'conflict':
        return t('anchors.notice.conflict')
      case 'failed':
        return t('anchors.notice.failed')
      case 'refused':
        switch (notice.code) {
          case 'focus_cap_reached':
            return t('anchors.notice.focusCap', { max: MAX_FOCUS_ANCHORS })
          case 'session_cap_reached':
            return t('anchors.notice.sessionCap')
          case 'origin_immutable':
            return t('anchors.notice.originImmutable')
          case 'agent_cannot_focus':
          case 'agent_role_forbidden':
            return t('anchors.notice.agentForbidden')
          default:
            return t('anchors.notice.refused', { reason: notice.message })
        }
      case 'done':
        return t(`anchors.notice.${notice.action}`, { name: anchorName(notice.anchor) })
    }
  }
}
