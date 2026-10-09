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
