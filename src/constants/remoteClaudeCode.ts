// ============================================================================
// CLAUDE CODE DISTANT (SSH) — validation and French copy
// ============================================================================
//
// A `claude_code_remote` instance runs the Claude Code CLI on ANOTHER machine.
// What the interface stores is only references and PUBLIC data: the machine,
// the PINNED host key (public) and `vault:<name>` for the private key. A private
// key is never typed, pasted or shown here.

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

export function validateMachineName(raw: string, taken: readonly string[]): string | null {
  const name = raw.trim()
  if (!name) return 'Le nom de la machine est obligatoire.'
  if (name.length > 36 || !MACHINE_NAME.test(name))
    return 'Lettres minuscules, chiffres et « - » uniquement (36 caractères au plus).'
  if (taken.includes(remoteInstanceId(name))) return 'Une instance porte déjà ce nom.'
  return null
}

export function validateSshHost(raw: string): string | null {
  const host = raw.trim()
  if (!host) return 'L’adresse de la machine est obligatoire.'
  if (host.startsWith('-')) return 'L’adresse ne peut pas commencer par « - ».'
  if (host.length > 255 || !HOST.test(host))
    return 'Un nom ou une adresse : lettres, chiffres et « . _ - : [ ] % @ » uniquement.'
  return null
}

export function validateSshUser(raw: string): string | null {
  const user = raw.trim()
  if (!user) return null
  if (user.startsWith('-')) return 'Le nom d’utilisateur ne peut pas commencer par « - ».'
  if (user.length > 64 || !SSH_USER.test(user))
    return 'Lettres, chiffres, « . », « _ » et « - » uniquement.'
  return null
}

/** Empty = default (22). */
export function validateSshPort(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 65535) return 'Un port entre 1 et 65535.'
  return null
}

export function validateRemoteCwd(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(raw)) return 'Le dossier ne peut pas contenir de saut de ligne.'
  return null
}

/** Whether a string looks like (part of) a private key or other PEM material. */
export function looksLikePrivateKey(raw: string): boolean {
  return /-----\s*BEGIN/i.test(raw) || /PRIVATE KEY/i.test(raw) || raw.includes('\n')
}

export const PRIVATE_KEY_REFUSED_FR =
  'Ceci ressemble à une clé privée : ne la collez jamais ici. Enregistrez-la dans le coffre et indiquez seulement son nom.'

/** Name of the vault secret holding the SSH private key. A pasted key is refused. */
export function validateVaultKeyName(raw: string): string | null {
  const name = raw.trim()
  if (!name) return 'Choisissez la clé SSH du coffre.'
  if (looksLikePrivateKey(raw)) return PRIVATE_KEY_REFUSED_FR
  if (name.length > 64 || !SECRET_NAME.test(name))
    return 'Le nom d’une clé du coffre : lettres, chiffres, « _ », « - » et « . » uniquement.'
  return null
}

/** The pinned public key line: "<type> <base64>" (a trailing comment is tolerated). */
export function validateHostKey(raw: string): string | null {
  const line = raw.trim()
  if (!line) return 'Récupérez la clé de la machine, ou collez-la.'
  if (looksLikePrivateKey(line)) return PRIVATE_KEY_REFUSED_FR
  const [type, body] = line.split(/\s+/)
  if (!type || !body || !KEY_TYPE.test(type) || !BASE64.test(body))
    return 'Une clé publique de machine : « ssh-ed25519 AAAA… » (type, espace, clé en base64).'
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

export const REMOTE_TRUST_WARNING_FR =
  'Le mode « Rock’n roll » exécute les actions sans demander de confirmation, sur cette machine, avec ses droits. N’activez ceci que pour une machine jetable ou de confiance.'

export const REMOTE_KEY_HINT_FR =
  'Utilisez une clé dédiée, sans phrase secrète : la connexion est non interactive et n’utilise pas d’agent SSH.'

export const REMOTE_CONFIRM_FINGERPRINT_FR =
  'Je confirme que cette empreinte est bien celle de la machine'
