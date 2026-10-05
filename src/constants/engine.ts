// ============================================================================
// ENGINE — what the banner says when the agent engine runs a session
// ============================================================================
//
// With `CHAT_PROVIDER_PATH=agent` the session runs on the nexus engine, which
// does not (yet) do everything the legacy Claude Code engine does. The server
// lists what is missing in `system_init.degraded_features` (confirmed by the backend); each
// id gets a plain sentence, an unknown id is shown humanised rather than hidden.

export const ENGINE_BANNER_TITLE = 'Agent engine: some features are not available in this conversation'

export const ENGINE_FEATURE_LABELS: Readonly<Record<string, string>> = {
  hooks: 'Hooks (skills, post-tool redirects) do not run',
  message_queue: 'A message sent while a turn runs is refused, not queued',
  auto_continue: 'Auto-continue is off',
  retry: 'Failed turns are not retried automatically',
  compaction: 'Context compaction is not done for you',
  nats: 'Live events between sessions (NATS) are off',
  enrichment: 'Entity enrichment of messages is off',
  images: 'Images cannot be attached',
}

export function engineFeatureLabel(id: string): string {
  return ENGINE_FEATURE_LABELS[id] ?? `${id.replace(/[_-]+/g, ' ')} is not available`
}
