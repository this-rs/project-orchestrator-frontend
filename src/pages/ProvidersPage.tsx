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
import type { ConceptExplain } from '@/constants/nomenclature'
import { ProviderSettings } from '@/components/settings/ProviderSettings'

const PROVIDERS_EXPLAIN: ConceptExplain = {
  what: 'Your choice of AI: Claude Code is built in, and you can register another provider and allow it project by project.',
  why: 'You pick the provider and the model for a conversation, and a key is never typed into a form: it stays in the vault.',
  different: 'Today one tool means one model. Here a conversation stays on its provider, and the assistant that delegates a task can name the provider and the model for it.',
}

export function ProvidersPage() {
  const navigate = useNavigate()
  return (
    <div className="h-dvh overflow-y-auto bg-[var(--bg-primary)]">
      <div className="px-4 md:px-6">
        <PageContainer width="narrow" className="space-y-6">
          <div className="space-y-1">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-3 text-gray-400">
              <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Back
            </Button>
            <PageHeader
              title="Providers"
              description="Where your conversations run, what each project may send there, and which model does what."
              intro={PROVIDERS_EXPLAIN}
            />
          </div>
          <ProviderSettings />
        </PageContainer>
      </div>
    </div>
  )
}
