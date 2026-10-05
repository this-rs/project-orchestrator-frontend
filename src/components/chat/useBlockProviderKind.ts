import { useAtomValue } from 'jotai'
import { chatProviderTargetAtom, chatSessionIdAtom } from '@/atoms'
import type { ProviderKind } from '@/types/provider'
import { useChatSessionId } from './ChatSessionContext'

/**
 * Kind of the provider a transcript block belongs to, or `undefined` when it
 * cannot be told.
 *
 * The provider atoms describe the session open in the chat panel, so they only
 * apply to a block of THAT session; any other transcript (runner, linked
 * discussion) resolves as Claude Code, helped by the alias its events carry.
 */
export function useBlockProviderKind(): ProviderKind | undefined {
  const sessionId = useChatSessionId()
  const currentSessionId = useAtomValue(chatSessionIdAtom)
  const providerTarget = useAtomValue(chatProviderTargetAtom)
  return sessionId !== null && sessionId === currentSessionId ? providerTarget.providerKind : undefined
}
