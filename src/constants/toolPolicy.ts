// ============================================================================
// TOOL POLICY — the one module for permission-mode strings
// ============================================================================
//
// The interface holds a mode as a neutral `ToolPolicyMode`. Whatever comes in
// (a legacy Claude string or a neutral one, from the config, a session record,
// `permission_mode_changed` or `system_init`) is read with `readToolPolicyMode`;
// whatever goes out is written with `toWireMode`.
//
// Two label sets live here:
// - `claude`: word for word what each screen showed before providers existed.
//   A session without a provider (or on `claude-code`) keeps these.
// - `neutral`: for every other provider, where "Bypass permissions" (a Claude
//   CLI flag) means nothing.

import {
  LEGACY_MODE_TO_POLICY,
  POLICY_TO_LEGACY_MODE,
  toToolPolicyMode,
  type LegacyPermissionMode,
  type ToolPolicyMode,
} from '@/types/provider'

/** The mode assumed when nothing (or nothing readable) was received. */
export const DEFAULT_TOOL_POLICY_MODE: ToolPolicyMode = 'ask'

/** Read a mode received in either form. Unknown or absent → `ask`, the least permissive interactive mode. */
export function readToolPolicyMode(value: unknown): ToolPolicyMode {
  return toToolPolicyMode(value) ?? DEFAULT_TOOL_POLICY_MODE
}

/** The four legacy strings this app writes (config file, pre-provider backend). */
export type LegacyWireMode = (typeof POLICY_TO_LEGACY_MODE)[ToolPolicyMode]

export function isLegacyWireMode(value: unknown): value is LegacyWireMode {
  return typeof value === 'string' && (Object.values(POLICY_TO_LEGACY_MODE) as string[]).includes(value)
}

/**
 * The string sent to the backend for a mode.
 *
 * `neutral: false` → the legacy Claude string: for a Claude Code session, and
 * whenever the backend does not expose providers (it would not understand a
 * neutral name). `neutral: true` → the neutral name, for a non-Claude provider.
 */
export function toWireMode(mode: ToolPolicyMode, { neutral }: { neutral: boolean }): LegacyWireMode | ToolPolicyMode {
  return neutral ? mode : POLICY_TO_LEGACY_MODE[mode]
}

// ----------------------------------------------------------------------------
// Labels
// ----------------------------------------------------------------------------

export type ModeLabelSet = 'claude' | 'neutral'

/** Label set of a session: Claude wording for Claude Code (and legacy sessions), neutral otherwise. */
export function modeLabelSet(isClaudeCode: boolean): ModeLabelSet {
  return isClaudeCode ? 'claude' : 'neutral'
}

type PerMode<T> = Readonly<Record<ToolPolicyMode, T>>
type PerSet<T> = Readonly<Record<ModeLabelSet, PerMode<T>>>

/** Dot colour of a mode — the same on every screen and for every provider. */
export const MODE_DOT_COLORS: PerMode<string> = {
  trust: 'bg-emerald-400',
  auto_edits: 'bg-blue-400',
  ask: 'bg-amber-400',
  plan_only: 'bg-gray-400',
}

/** Dot colour of a mode nobody could read. */
export const UNKNOWN_MODE_DOT_COLOR = 'bg-gray-400'

const NEUTRAL_LABELS: PerMode<string> = {
  trust: "Rock'n roll",
  auto_edits: 'Auto-approve edits',
  ask: 'Ask',
  plan_only: 'Plan only',
}

/** Composer mode selector (`ChatInput`), in the order it lists them. */
export const COMPOSER_MODE_ORDER: readonly ToolPolicyMode[] = ['trust', 'auto_edits', 'ask', 'plan_only']

export const COMPOSER_MODE_LABELS: PerSet<string> = {
  claude: {
    trust: "Rock'n roll",
    auto_edits: 'Accept Edits',
    ask: 'Default',
    plan_only: 'Plan Only',
  },
  neutral: NEUTRAL_LABELS,
}

/** Session list metadata line (`sessionListUtils`). */
export const SESSION_LIST_MODE_LABELS: PerSet<string> = {
  claude: {
    trust: "Rock'n roll",
    auto_edits: 'Accept edits',
    ask: 'Ask permissions',
    plan_only: 'Plan mode',
  },
  neutral: NEUTRAL_LABELS,
}

/**
 * Modes only the Claude CLI has (`auto`, `dontAsk`). They are READ (a config
 * edited by hand, a session started from a terminal), never written: the
 * neutral mode they map to would hide what the CLI is really doing, so they
 * get their own name. `manual` is just the new name of `default`.
 */
const CLAUDE_NATIVE_ONLY_LABELS: Readonly<Partial<Record<LegacyPermissionMode, { short: string; long: string }>>> = {
  auto: { short: 'Auto', long: 'Auto mode' },
  dontAsk: { short: "Don't Ask", long: "Don't ask" },
}

/**
 * Label of a Claude-native mode that has no neutral twin, or `null` when the
 * neutral mode's label already says it all.
 */
export function claudeNativeModeLabel(nativeMode: unknown, form: 'short' | 'long'): string | null {
  if (typeof nativeMode !== 'string') return null
  if (!Object.prototype.hasOwnProperty.call(LEGACY_MODE_TO_POLICY, nativeMode)) return null
  return CLAUDE_NATIVE_ONLY_LABELS[nativeMode as LegacyPermissionMode]?.[form] ?? null
}

/** One option of the permission settings panel. */
export interface SettingsModeOption {
  mode: ToolPolicyMode
  label: string
  description: string
  /** Classes of the option when it is the selected one. */
  bgActive: string
}

const SETTINGS_ACTIVE_BG: PerMode<string> = {
  trust: 'bg-emerald-500/10 border-emerald-500/40',
  auto_edits: 'bg-blue-500/10 border-blue-500/40',
  ask: 'bg-amber-500/10 border-amber-500/40',
  plan_only: 'bg-gray-500/10 border-gray-400/40',
}

const SETTINGS_TEXT: PerSet<{ label: string; description: string }> = {
  claude: {
    trust: { label: "Rock'n roll", description: 'Auto-approve all tools. No prompts.' },
    auto_edits: { label: 'Accept Edits', description: 'Auto-approve file edits, prompt for commands.' },
    ask: { label: 'Default', description: 'Prompt for all tool usage.' },
    plan_only: { label: 'Plan Only', description: 'Read-only mode. No writes or commands.' },
  },
  neutral: {
    trust: { label: NEUTRAL_LABELS.trust, description: 'Run every tool without asking.' },
    auto_edits: { label: NEUTRAL_LABELS.auto_edits, description: 'File edits run without asking; commands still ask.' },
    ask: { label: NEUTRAL_LABELS.ask, description: 'Ask before every tool call.' },
    plan_only: { label: NEUTRAL_LABELS.plan_only, description: 'Read-only. No writes or commands.' },
  },
}

/** Options of `PermissionSettingsPanel`, in display order. */
export function settingsModeOptions(set: ModeLabelSet): SettingsModeOption[] {
  return COMPOSER_MODE_ORDER.map((mode) => ({ mode, ...SETTINGS_TEXT[set][mode], bgActive: SETTINGS_ACTIVE_BG[mode] }))
}

/**
 * Setup wizard (it configures the built-in Claude Code instance, so there is
 * no neutral set): the choices, then the one-line summary of the launch page.
 */
export const SETUP_MODE_OPTIONS: ReadonlyArray<{ mode: ToolPolicyMode; label: string; description: string }> = [
  { mode: 'trust', label: "Rock'n roll", description: 'All tools auto-approved — no permission prompts' },
  { mode: 'ask', label: 'Default', description: 'Asks approval for file edits and shell commands' },
  { mode: 'auto_edits', label: 'Accept Edits', description: 'File edits auto-approved, shell commands need approval' },
  { mode: 'plan_only', label: 'Plan Only', description: 'Read-only mode — Claude can read but not modify files' },
]

export const SETUP_MODE_SUMMARIES: PerMode<string> = {
  trust: "Rock'n roll (all auto-approved)",
  ask: 'Default (ask for edits & shell)',
  auto_edits: 'Accept Edits (ask for shell only)',
  plan_only: 'Plan Only (read-only)',
}

// ----------------------------------------------------------------------------
// Explanations shown when a provider cannot offer something
// ----------------------------------------------------------------------------

/**
 * `trust` is held back for ONE case: a Claude Code on another machine whose record does not
 * allow it (its tools run where nobody is watching). Every other provider behaves like Claude
 * Code (decision of 2026-10-07, which replaces A35): the sandbox level is information, not a gate.
 */
export const TRUST_REQUIRES_SANDBOX_TEXT =
  'Indisponible : cette machine distante n’autorise pas ce mode. Activez-le dans les réglages de l’instance pour exécuter ses outils sans confirmation.'

/** Allow/deny rules use Claude Code's pattern syntax (`Bash(git *)`), which other providers do not read. */
export const RULES_UNSUPPORTED_TEXT =
  'Les règles d’autorisation et de blocage sont propres à Claude Code. Ce provider ne les applique pas, elles ne sont donc pas affichées : c’est le mode de permission ci-dessus qui encadre ses outils.'

/**
 * Whether `trust` may be picked: on every provider, whatever its sandbox — except a Claude Code on
 * another machine whose record does not allow it (`trustHeldBack`).
 */
export function isTrustAllowed(target: { trustHeldBack: boolean }): boolean {
  return !target.trustHeldBack
}

/** The mode a refused `trust` falls back to: the closest mode every provider accepts. */
export const TRUST_FALLBACK_MODE: ToolPolicyMode = 'ask'

/** Shown when `trust` was replaced because the target machine does not allow it. */
export const TRUST_DOWNGRADED_TEXT =
  'Le mode « Rock’n roll » a été remplacé par « Demander » : cette machine distante ne l’autorise pas.'

/**
 * The mode actually usable on `target`: `trust` on a provider that refuses it
 * becomes `ask` (refused server-side otherwise). That is only a remote machine that does not allow
 * it; every other mode, and `trust` on any other provider, is kept.
 */
export function usableMode(
  mode: ToolPolicyMode | null | undefined,
  target: { trustHeldBack: boolean },
): ToolPolicyMode | null {
  if (!mode) return null
  return mode === 'trust' && !isTrustAllowed(target) ? TRUST_FALLBACK_MODE : mode
}
