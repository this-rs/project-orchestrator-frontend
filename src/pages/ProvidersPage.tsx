/**
 * ProvidersPage — the AI providers: instances, project consent, roles, aliases
 * and model policy. Reachable in web and desktop mode (`/providers`), linked
 * from the user menu and from the provider error cards.
 *
 * Providers have no `ConceptKey` (they are a setting, not a concept of the
 * menu — audit matrix #18), so the intro is written inline from the site's
 * pillar « Your choice of AI » (website `features.pillars.models`), with the
 * same three-line shape as the registry (`ConceptExplain`).
 */

import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button, PageContainer, PageHeader } from '@/components/ui'
import { useT } from '@/i18n'
import type { ConceptExplain } from '@/constants/nomenclature'
import { ProviderSettings } from '@/components/settings/ProviderSettings'

function useProvidersExplain(): ConceptExplain {
  const { t } = useT()
  return {
    what: t('settingsPage.providers.explain.what'),
    why: t('settingsPage.providers.explain.why'),
    different: t('settingsPage.providers.explain.different'),
  }
}

export function ProvidersPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const explain = useProvidersExplain()
  return (
    <div className="h-dvh overflow-y-auto bg-[var(--bg-primary)]">
      <div className="px-4 md:px-6">
        <PageContainer width="narrow" className="space-y-6">
          <div className="space-y-1">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-3 text-gray-400">
              <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t('settingsPage.back')}
            </Button>
            <PageHeader
              title={t('settingsPage.providers.title')}
              description={t('settingsPage.providers.description')}
              intro={explain}
            />
          </div>
          <ProviderSettings />
        </PageContainer>
      </div>
    </div>
  )
}
