import type { ChatProviderChoice } from '@/atoms/setup'

/** Wording of the setup wizard's chat-engine choice (one module for the provider-related labels). */
export const SETUP_CHAT_ENGINE_OPTIONS: ReadonlyArray<{
  value: ChatProviderChoice
  label: string
  description: string
}> = [
  {
    value: 'claude-code',
    label: 'Claude Code',
    description: 'Uses the Claude Code CLI installed on this machine.',
  },
  {
    value: 'none',
    label: 'Another provider (configure later)',
    description: 'Skip for now: add an engine in Settings → Providers after setup.',
  },
]

export const SETUP_NO_ENGINE_NOTE =
  'No engine is set up here. The Claude Code CLI is not required: add a provider in Settings → Providers once the app is running.'

export const SETUP_LAUNCH_NO_ENGINE_SUMMARY = 'To configure in Settings → Providers'
