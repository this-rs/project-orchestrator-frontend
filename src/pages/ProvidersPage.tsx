/**
 * ProvidersPage — agent providers: instances, project consent, roles, aliases
 * and model policy. Reachable in web and desktop mode (`/providers`), linked
 * from the user menu and from the provider error cards.
 */

import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button, PageContainer, PageHeader } from '@/components/ui'
import { ProviderSettings } from '@/components/settings/ProviderSettings'

export function ProvidersPage() {
  const navigate = useNavigate()
  return (
    <div className="h-dvh overflow-y-auto bg-[var(--bg-primary)]">
      <div className="px-4 md:px-6">
        <PageContainer width="narrow" className="space-y-6">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="-ml-3 text-gray-400"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Retour
            </Button>
            <PageHeader
              title="Providers"
              description="Les moteurs sur lesquels tournent les conversations, ce que chaque projet a le droit de leur envoyer, et quel modèle fait quoi."
            />
          </div>
          <ProviderSettings />
        </PageContainer>
      </div>
    </div>
  )
}
