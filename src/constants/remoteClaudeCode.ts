// ============================================================================
// REMOTE CLAUDE CODE (SSH) — validation
// ============================================================================
//
// A `claude_code_remote` instance runs the Claude Code CLI on ANOTHER machine.
// What the interface stores is only references and PUBLIC data: the machine,
// the PINNED host key (public) and `vault:<name>` for the private key. A private
// key is never typed, pasted or shown here.

import type { Translator } from '@/i18n/translate'

export const REMOTE_KIND = 'claude_code_remote'
/** Prefix of the id of every remote instance: `claude-code@<name>`. */
export const REMOTE_ID_PREFIX = 'claude-code@'
export const DEFAULT_SSH_PORT = 22

/** Host: letters, digits and `. _ - : [ ] % @`, no leading `-` (it would be read as an ssh option). */
const HOST = /^[A-Za-z0-9._:[\]%@-]+$/
const SSH_USER = /^[A-Za-z0-9._-]+$/
const MACHINE_NAME = /^[a-z0-9][a-z0-9-]*$/
const SECRET_NAME = /^[A-Za-z0-9_.-]+$/
const KEY_TYPE = /^(ssh-ed25519|ssh-rsa|ssh-dss|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)$/
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export function remoteInstanceId(name: string): string {
  return `${REMOTE_ID_PREFIX}${name.trim()}`
}

type T = Translator['t']
const V = 'providerAdmin.common.validation.' as const

export function validateMachineName(raw: string, taken: readonly string[], t: T): string | null {
  const name = raw.trim()
  if (!name) return t(`${V}machineRequired`)
  if (name.length > 36 || !MACHINE_NAME.test(name)) return t(`${V}machineFormat`)
  if (taken.includes(remoteInstanceId(name))) return t(`${V}machineTaken`)
  return null
}

export function validateSshHost(raw: string, t: T): string | null {
  const host = raw.trim()
  if (!host) return t(`${V}hostRequired`)
  if (host.startsWith('-')) return t(`${V}hostDash`)
  if (host.length > 255 || !HOST.test(host)) return t(`${V}hostFormat`)
  return null
}

export function validateSshUser(raw: string, t: T): string | null {
  const user = raw.trim()
  if (!user) return null
  if (user.startsWith('-')) return t(`${V}userDash`)
  if (user.length > 64 || !SSH_USER.test(user)) return t(`${V}userFormat`)
  return null
}

/** Empty = default (22). */
export function validateSshPort(raw: string, t: T): string | null {
  const v = raw.trim()
  if (!v) return null
  if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 65535) return t(`${V}portRange`)
  return null
}

export function validateRemoteCwd(raw: string, t: T): string | null {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(raw)) return t(`${V}cwdNewline`)
  return null
}

/** Whether a string looks like (part of) a private key or other PEM material. */
export function looksLikePrivateKey(raw: string): boolean {
  return /-----\s*BEGIN/i.test(raw) || /PRIVATE KEY/i.test(raw) || raw.includes('\n')
}

/** Name of the vault secret holding the SSH private key. A pasted key is refused. */
export function validateVaultKeyName(raw: string, t: T): string | null {
  const name = raw.trim()
  if (!name) return t(`${V}vaultKeyChoose`)
  if (looksLikePrivateKey(raw)) return t(`${V}privateKeyRefused`)
  if (name.length > 64 || !SECRET_NAME.test(name)) return t(`${V}vaultKeyFormat`)
  return null
}

/** The pinned public key line: "<type> <base64>" (a trailing comment is tolerated). */
export function validateHostKey(raw: string, t: T): string | null {
  const line = raw.trim()
  if (!line) return t(`${V}hostKeyFetch`)
  if (looksLikePrivateKey(line)) return t(`${V}privateKeyRefused`)
  const [type, body] = line.split(/\s+/)
  if (!type || !body || !KEY_TYPE.test(type) || !BASE64.test(body)) return t(`${V}hostKeyFormat`)
  return null
}

/** What the backend computes (`ssh:<user@>host:port`), to show before the instance exists. */
export function remoteOrigin(host: string, user: string, port: string): string {
  const p = port.trim() || String(DEFAULT_SSH_PORT)
  const u = user.trim()
  return `ssh:${u ? `${u}@` : ''}${host.trim()}:${p}`
}

export const REMOTE_NO_TOOLS_FR =
  'Claude Code distant n’a pas les outils PO (MCP) dans cette version : il ne peut pas lire ni modifier les plans, tâches et notes du projet. L’annulation d’un seul outil n’est pas non plus disponible : utilisez Stop pour interrompre tout le tour.'

