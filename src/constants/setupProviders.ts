import type { ChatProviderChoice } from '@/atoms/setup'
import { tr } from '@/i18n/lazy'

/** Wording of the setup wizard's chat-engine choice (one module for the provider-related labels). */
export function setupChatEngineOptions(): ReadonlyArray<{
  value: ChatProviderChoice
  label: string
  description: string
}> {
  return [
    {
      value: 'claude-code',
      label: 'Claude Code',
      description: tr('providers.setup.claudeCodeDescription'),
    },
    {
      value: 'none',
      label: tr('providers.setup.otherLabel'),
      description: tr('providers.setup.otherDescription'),
    },
  ]
}

export const setupNoEngineNote = (): string => tr('providers.setup.noEngineNote')

export const setupLaunchNoEngineSummary = (): string => tr('providers.setup.launchSummary')

/** Texts of the Chat and Auth steps about Claude Code being optional and other providers needing a login account. */
export const setupChatTexts = () => ({
  cliAbsentNote: tr('providers.setup.cliAbsentNote'),
  cliOptionalTitle: tr('providers.setup.cliOptionalTitle'),
  cliOptionalBody: tr('providers.setup.cliOptionalBody'),
  authRequiredTitle: tr('providers.setup.authRequiredTitle'),
  authRequiredBody: tr('providers.setup.authRequiredBody'),
  authRequiredAction: tr('providers.setup.authRequiredAction'),
  authNoneNote: tr('providers.setup.authNoneNote'),
  embeddingLater: tr('providers.setup.embeddingLater'),
})
