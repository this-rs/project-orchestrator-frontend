import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Section, EmptyState } from '@/components/ui'
import { providersLoadStateAtom } from '@/atoms'
import { useProviders } from '@/hooks/useProviders'
import { UNSUPPORTED_TEXT, UNSUPPORTED_TITLE } from '@/constants/providerSettings'
import { ModelPolicy } from './ModelPolicy'
import { ProjectConsent } from './ProjectConsent'
import { ProviderInstances } from './ProviderInstances'
import { ProviderRoles } from './ProviderRoles'

export const PROVIDER_SECTIONS = [
  { id: 'instances', title: 'Instances' },
  { id: 'consent', title: 'Project consent' },
  { id: 'roles', title: 'Roles' },
  { id: 'models', title: 'Models and policy' },
] as const

/** Every provider setting, without page chrome: the `/providers` page and the desktop settings embed it. */
export function ProviderSettings() {
  useProviders()
  const state = useAtomValue(providersLoadStateAtom)
  const { hash } = useLocation()

  // Router does not scroll to an anchor by itself.
  useEffect(() => {
    if (hash && state !== 'idle' && state !== 'loading') document.getElementById(hash.slice(1))?.scrollIntoView?.()
  }, [hash, state])

  if (state === 'unsupported') {
    return (
      <div data-testid="providers-unsupported">
        <EmptyState size="sm" title={UNSUPPORTED_TITLE} description={UNSUPPORTED_TEXT} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <nav aria-label="Provider settings sections" className="flex flex-wrap gap-3 text-sm">
        {PROVIDER_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="text-indigo-400 hover:text-indigo-300">
            {s.title}
          </a>
        ))}
      </nav>
      {state === 'error' && (
        <p role="alert" className="text-xs text-red-400">
          The provider list could not be loaded.
        </p>
      )}
      <Section id="instances" title="Instances" description="Where agents can run. A key is only ever a reference to the vault or to an environment variable.">
        <ProviderInstances />
      </Section>
      <Section id="consent" title="Project consent" description="A project's content only goes to endpoints it has agreed to.">
        <ProjectConsent />
      </Section>
      <Section id="roles" title="Roles" description="Which instance and model each role uses by default.">
        <ProviderRoles />
      </Section>
      <Section id="models" title="Models and policy" description="Aliases, routing rules, fallback and caps.">
        <ModelPolicy />
      </Section>
    </div>
  )
}
