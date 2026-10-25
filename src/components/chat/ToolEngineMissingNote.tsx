import { Link } from 'react-router-dom'
import { PackageX } from 'lucide-react'
import { useT } from '@/i18n'
import { PROVIDER_SETTINGS_PATH } from '@/constants/providerErrors'
import { focusRing } from '@/components/ui/classes'
import { TOOL_ENGINE_NOT_INSTALLED } from '@/utils/toolEngineMissing'

/**
 * A search that failed because THIS installation does not provide the built-in engine (a build
 * without Obscura, e.g. macOS Intel 10.15 legacy): said as a limit of the build — never of the
 * model — with the way out, in Settings → Network tools.
 */
export function ToolEngineMissingNote() {
  const { t } = useT()
  return (
    <div
      role="note"
      data-testid="tool-engine-missing"
      data-cause={TOOL_ENGINE_NOT_INSTALLED}
      className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-amber-500/25 px-3 py-1.5 text-[11px] text-amber-200"
    >
      <PackageX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <p>
        {t('networkTools.engines.embeddedMissingChat')}{' '}
        <Link to={`${PROVIDER_SETTINGS_PATH}#network-tools`} className={`rounded underline hover:text-amber-100 ${focusRing}`}>
          {t('networkTools.engines.embeddedMissingLink')}
        </Link>
      </p>
    </div>
  )
}
