export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: 'Auto-approve edits',
    ask: 'Ask',
    plan_only: 'Plan only',
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: 'Accept Edits',
    ask: 'Default',
    plan_only: 'Plan Only',
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: 'Accept edits',
    ask: 'Ask permissions',
    plan_only: 'Plan mode',
  },
  native: {
    auto: { short: 'Auto', long: 'Auto mode' },
    dontAsk: { short: "Don't Ask", long: "Don't ask" },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: 'Auto-approve all tools. No prompts.' },
      auto_edits: { label: 'Accept Edits', description: 'Auto-approve file edits, prompt for commands.' },
      ask: { label: 'Default', description: 'Prompt for all tool usage.' },
      plan_only: { label: 'Plan Only', description: 'Read-only mode. No writes or commands.' },
    },
    neutral: {
      trust: { description: 'Run every tool without asking.' },
      auto_edits: { description: 'File edits run without asking; commands still ask.' },
      ask: { description: 'Ask before every tool call.' },
      plan_only: { description: 'Read-only. No writes or commands.' },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: 'All tools auto-approved — no permission prompts',
      summary: "Rock'n roll (all auto-approved)",
    },
    ask: {
      label: 'Default',
      description: 'Asks approval for file edits and shell commands',
      summary: 'Default (ask for edits & shell)',
    },
    auto_edits: {
      label: 'Accept Edits',
      description: 'File edits auto-approved, shell commands need approval',
      summary: 'Accept Edits (ask for shell only)',
    },
    plan_only: {
      label: 'Plan Only',
      description: 'Read-only mode — Claude can read but not modify files',
      summary: 'Plan Only (read-only)',
    },
  },
  trustRequiresSandbox: 'Unavailable: this remote machine does not allow this mode. Enable it in the instance settings to run its tools without confirmation.',
  rulesUnsupported: 'Allow and deny rules are specific to Claude Code. This provider does not apply them, so they are not shown: the permission mode above is what governs its tools.',
  trustDowngraded: 'The “Rock’n roll” mode was replaced by “Ask”: this remote machine does not allow it.',
} as const
