import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Plus } from 'lucide-react'
import { Button, Section, EmptyState } from '@/components/ui'
import { providersLoadStateAtom } from '@/atoms'
import { useProviders } from '@/hooks/useProviders'
import { useT, type MessageKey } from '@/i18n'
import { providerInstancePath } from '@/constants/providerErrors'
import { ModelPolicy } from './ModelPolicy'
import { ProjectConsent } from './ProjectConsent'
import { ProviderInstances } from './ProviderInstances'
import { ProviderRoles } from './ProviderRoles'
import { ProviderWizard } from './ProviderWizard'
import { RoutingSettings } from './RoutingSettings'

const SECTIONS = [
  { id: 'instances', title: 'providerAdmin.settings.sectionInstances' },
  { id: 'consent', title: 'providerAdmin.settings.sectionConsent' },
  { id: 'routing', title: 'routing.settings.title' },
  { id: 'advanced', title: 'providerAdmin.settings.sectionAdvanced' },
] as const satisfies readonly { id: string; title: MessageKey }[]

/**
 * Every provider setting, without page chrome (the `/providers` page renders it):
 * the providers as cards with the "Add a provider" wizard, project consent,
 * and — folded under "Advanced" — roles, aliases and model policy.
 */
export function ProviderSettings() {
  const { t } = useT()
  const { providers } = useProviders()
  const state = useAtomValue(providersLoadStateAtom)
  const { hash } = useLocation()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)

  // Router does not scroll to an anchor by itself.
  useEffect(() => {
    if (hash && state !== 'idle' && state !== 'loading')
      document.getElementById(hash.slice(1))?.scrollIntoView?.()
  }, [hash, state])

  if (state === 'unsupported') {
    return (
      <div data-testid="providers-unsupported">
        <EmptyState
          size="sm"
          title={t('providerAdmin.settings.unsupportedTitle')}
          description={t('providerAdmin.settings.unsupportedText')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <nav aria-label={t('providerAdmin.settings.sectionsAria')} className="flex flex-wrap gap-4 text-sm">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="text-indigo-400 hover:text-indigo-300">
            {t(s.title)}
          </a>
        ))}
      </nav>
      {state === 'error' && (
        <p role="alert" className="text-xs text-red-400">
          {t('providerAdmin.settings.loadFailed')}
        </p>
      )}
      <Section
        id="instances"
        title={t('providerAdmin.settings.sectionInstances')}
        description={t('providerAdmin.settings.instancesDescription')}
        action={
          !adding && (
            <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('providerAdmin.settings.addProvider')}
            </Button>
          )
        }
      >
        <div className="space-y-4">
          {adding && (
            <ProviderWizard
              existingIds={providers.map((p) => p.id)}
              onClose={() => setAdding(false)}
              onFinished={(id) => {
                setAdding(false)
                navigate(providerInstancePath(id), { replace: true })
              }}
            />
          )}
          <ProviderInstances onAdd={adding ? undefined : () => setAdding(true)} />
        </div>
      </Section>
      <Section
        id="consent"
        title={t('providerAdmin.settings.sectionConsent')}
        description={t('providerAdmin.settings.consentDescription')}
      >
        <ProjectConsent onAddProvider={() => setAdding(true)} />
      </Section>
      <Section id="routing" title={t('routing.settings.title')}>
        <RoutingSettings />
      </Section>
      <Section
        id="advanced"
        title={t('providerAdmin.settings.sectionAdvanced')}
        description={t('providerAdmin.settings.advancedDescription')}
      >
        <div className="space-y-4">
          <div id="roles" className="scroll-mt-16">
            <ProviderRoles key={`roles-${hash}`} collapsible defaultOpen={hash === '#roles'} />
          </div>
          <div id="models" className="scroll-mt-16">
            <ModelPolicy key={`models-${hash}`} collapsible defaultOpen={hash === '#models'} />
          </div>
        </div>
      </Section>
    </div>
  )
}
