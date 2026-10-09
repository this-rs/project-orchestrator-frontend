export default {
  degradation: {
    title: 'Some features are not available in this conversation',
    harness: {
      heading: 'Not yet carried by the Project Orchestrator agent engine',
      note: 'Work in progress on our side: this is not a limit of the model.',
    },
    model: {
      heading: 'Limits of this model or provider',
      note: 'As the provider declares them for this model.',
    },
    unprobed: {
      heading: 'Not measured yet',
      note: 'Unknown does not mean missing.',
    },
  },
  harness: {
    hooks: 'Hooks (skills, post-tool redirects) do not run yet',
    message_queue: 'A message sent while a turn runs is refused instead of queued',
    auto_continue: 'Auto-continue is not available yet',
    retry: 'Failed turns are not retried automatically yet',
    compaction: 'Context compaction is not done for you yet',
    nats: 'Live events between sessions (NATS) are not wired yet',
    enrichment: 'Entity enrichment of messages is not wired yet',
    images: 'Images are not passed to the model yet',
    tools: 'Tools are not passed to the model yet',
    unknown: '{feature}: not available yet',
  },
  model: {
    images: 'This model does not accept images',
    tools: 'This model cannot call tools',
    compaction: 'This provider does not signal context compaction',
    project_orchestrator_tools: 'This provider cannot carry the Project Orchestrator tools (no MCP server per session)',
  },
  unprobed: {
    context_window: 'Context window not probed yet: this does not mean the model lacks a long context',
  },
  images: {
    model: 'This model does not accept images. Not attached: {names}.',
    harness: 'The Project Orchestrator agent engine does not pass images to the model yet. Not attached: {names}.',
  },
  errors: {
    harnessGap: 'The Project Orchestrator agent engine does not do this yet ({feature}). It is work in progress on our side, not a limit of the model.',
  },
  init: {
    title: 'Session initialized',
    tools: 'Tools: {count}',
    mcpServers: 'MCP servers: {count}',
  },
  tools: {
    toggle: 'Show the tools offered in this session',
    heading: 'Tools offered in this session',
    builtin: 'Built-in tools',
    server: 'MCP server {server}',
    shortened: 'MCP tools with a shortened name (cut to 64 characters)',
    count: 'Tools: {count}',
    allowHeading: 'Allowed patterns',
    available: 'Available — matching tools: {count}',
    unavailable: 'Not available in this session',
  },
} as const
