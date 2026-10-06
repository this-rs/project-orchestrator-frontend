import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Plus } from 'lucide-react'
import { Button, Section, EmptyState } from '@/components/ui'
import { providersLoadStateAtom } from '@/atoms'
import { useProviders } from '@/hooks/useProviders'
import {
  PROVIDER_SECTIONS,
  UNSUPPORTED_TEXT,
  UNSUPPORTED_TITLE,
} from '@/constants/providerSettings'
import { providerInstancePath } from '@/constants/providerErrors'
import { ModelPolicy } from './ModelPolicy'
import { ProjectConsent } from './ProjectConsent'
import { ProviderInstances } from './ProviderInstances'
import { ProviderRoles } from './ProviderRoles'
import { ProviderWizard } from './ProviderWizard'

/**
 * Every provider setting, without page chrome (the `/providers` page renders it):
 * the providers as cards with the "Ajouter un provider" wizard, project consent,
 * and — folded under "Avancé" — roles, aliases and model policy.
 */
export function ProviderSettings() {
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
        <EmptyState size="sm" title={UNSUPPORTED_TITLE} description={UNSUPPORTED_TEXT} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <nav aria-label="Sections des providers" className="flex flex-wrap gap-4 text-sm">
        {PROVIDER_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="text-indigo-400 hover:text-indigo-300">
            {s.title}
          </a>
        ))}
      </nav>
      {state === 'error' && (
        <p role="alert" className="text-xs text-red-400">
          La liste des providers n’a pas pu être chargée.
        </p>
      )}
      <Section
        id="instances"
        title="Providers"
        description="Où les agents peuvent tourner. Une clé n’est jamais qu’une référence au coffre ou à une variable du serveur."
        action={
          !adding && (
            <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Ajouter un provider
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
          <ProviderInstances />
        </div>
      </Section>
      <Section
        id="consent"
        title="Autorisations des projets"
        description="Le contenu d’un projet (prompts, fichiers, résultats d’outils) ne part que vers les origines qu’il a autorisées ; sans autorisation, il ne part nulle part ailleurs que vers Claude Code."
      >
        <ProjectConsent onAddProvider={() => setAdding(true)} />
      </Section>
      <Section
        id="advanced"
        title="Avancé"
        description="Rôles, alias et politique de modèle. Rien à régler pour un premier provider : sans réglage, tout passe par le provider par défaut."
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
