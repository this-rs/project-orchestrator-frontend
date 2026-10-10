/**
 * The machine of a "Claude Code remote (SSH)" instance: host, user, port,
 * remote folder, the host key to PIN (fetched by the server, shown as a
 * fingerprint, accepted only after an explicit human confirmation) and the
 * "Rock'n roll" switch (off, warned).
 *
 * There is no field for a private key anywhere: the key is a vault reference,
 * chosen elsewhere.
 */
import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { wizardErrorMessage } from '@/constants/providerWizard'
import { useT } from '@/i18n'
import {
  remoteOrigin,
  validateHostKey,
  validateRemoteCwd,
  validateSshHost,
  validateSshPort,
  validateSshUser,
} from '@/constants/remoteClaudeCode'
import { providersApi } from '@/services/providers'
import type { Translator } from '@/i18n/translate'
import { FormField } from './FormField'

export interface RemoteState {
  host: string
  sshUser: string
  /** Text: empty = 22. */
  sshPort: string
  remoteCwd: string
  allowTrust: boolean
  /** The public key line to pin, fetched or pasted. */
  hostKey: string
  /** Computed by the server for a fetched key; '' for a pasted one. */
  hostKeyFingerprint: string
  /** The human confirmed that this key is the machine's. */
  hostKeyConfirmed: boolean
  /** Editing: the server already holds a pinned key (its fingerprint is shown) and nothing was changed. */
  hostKeyKept: boolean
}

export type RemoteField = 'host' | 'sshUser' | 'sshPort' | 'remoteCwd' | 'hostKey'

export const EMPTY_REMOTE: RemoteState = {
  host: '',
  sshUser: '',
  sshPort: '',
  remoteCwd: '',
  allowTrust: false,
  hostKey: '',
  hostKeyFingerprint: '',
  hostKeyConfirmed: false,
  hostKeyKept: false,
}

export function remoteErrors(
  r: RemoteState,
  t: Translator['t'],
): Partial<Record<RemoteField, string>> {
  const e: Partial<Record<RemoteField, string>> = {}
  const host = validateSshHost(r.host, t)
  if (host) e.host = host
  const user = validateSshUser(r.sshUser, t)
  if (user) e.sshUser = user
  const port = validateSshPort(r.sshPort, t)
  if (port) e.sshPort = port
  const cwd = validateRemoteCwd(r.remoteCwd, t)
  if (cwd) e.remoteCwd = cwd
  if (!r.hostKeyKept) {
    const key = validateHostKey(r.hostKey, t)
    if (key) e.hostKey = key
    else if (!r.hostKeyConfirmed) e.hostKey = t('providerAdmin.remote.confirmFirst')
  }
  return e
}

export function RemoteHostFields({
  uid,
  value,
  errors,
  touched,
  onChange,
  onTouch,
}: {
  uid: string
  value: RemoteState
  errors: Partial<Record<RemoteField, string>>
  touched: Partial<Record<RemoteField, boolean>>
  onChange: (patch: Partial<RemoteState>) => void
  onTouch: (field: RemoteField) => void
}) {
  const { t } = useT()
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const shown = (f: RemoteField) => (touched[f] ? errors[f] : undefined)

  /** Changing the machine or its port makes the pinned key and its confirmation obsolete. */
  const change = (patch: Partial<RemoteState>) => {
    const moved =
      (patch.host !== undefined && patch.host !== value.host) ||
      (patch.sshPort !== undefined && patch.sshPort !== value.sshPort)
    onChange(
      moved
        ? { ...patch, hostKey: '', hostKeyFingerprint: '', hostKeyConfirmed: false, hostKeyKept: false }
        : patch
    )
  }

  const fetchKey = async () => {
    onTouch('host')
    if (errors.host || errors.sshPort) return
    setFetching(true)
    setFetchError(null)
    try {
      const port = value.sshPort.trim()
      const res = await providersApi.sshHostKey({
        host: value.host.trim(),
        ...(port ? { ssh_port: Number(port) } : {}),
      })
      onChange({
        hostKey: res.host_key,
        hostKeyFingerprint: res.host_key_fingerprint,
        hostKeyConfirmed: false,
        hostKeyKept: false,
      })
    } catch (err) {
      setFetchError(wizardErrorMessage(err, t))
    } finally {
      setFetching(false)
    }
  }

  const hasKey = value.hostKey.trim() !== ''
  const pasted = hasKey && value.hostKeyFingerprint === ''

  return (
    <div className="space-y-4 sm:col-span-2" data-testid="remote-fields">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${uid}-host`}
          label={t('providerAdmin.remote.machine')}
          help={t('providerAdmin.remote.machineHelp')}
          error={shown('host')}
        >
          <Input
            id={`${uid}-host`}
            value={value.host}
            onChange={(e) => change({ host: e.target.value })}
            onBlur={() => onTouch('host')}
            aria-invalid={!!shown('host')}
            aria-describedby={shown('host') ? `${uid}-host-error` : `${uid}-host-help`}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
        <FormField
          id={`${uid}-ssh-user`}
          label={t('providerAdmin.remote.user')}
          help={t('providerAdmin.remote.userHelp')}
          error={shown('sshUser')}
        >
          <Input
            id={`${uid}-ssh-user`}
            value={value.sshUser}
            onChange={(e) => change({ sshUser: e.target.value })}
            onBlur={() => onTouch('sshUser')}
            aria-invalid={!!shown('sshUser')}
            aria-describedby={shown('sshUser') ? `${uid}-ssh-user-error` : `${uid}-ssh-user-help`}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
        <FormField
          id={`${uid}-ssh-port`}
          label={t('providerAdmin.remote.port')}
          help={t('providerAdmin.remote.portHelp')}
          error={shown('sshPort')}
        >
          <Input
            id={`${uid}-ssh-port`}
            value={value.sshPort}
            onChange={(e) => change({ sshPort: e.target.value })}
            onBlur={() => onTouch('sshPort')}
            placeholder="22"
            inputMode="numeric"
            aria-invalid={!!shown('sshPort')}
            aria-describedby={shown('sshPort') ? `${uid}-ssh-port-error` : `${uid}-ssh-port-help`}
            autoComplete="off"
          />
        </FormField>
        <FormField
          id={`${uid}-remote-cwd`}
          label={t('providerAdmin.remote.cwd')}
          help={t('providerAdmin.remote.cwdHelp')}
          error={shown('remoteCwd')}
        >
          <Input
            id={`${uid}-remote-cwd`}
            value={value.remoteCwd}
            onChange={(e) => change({ remoteCwd: e.target.value })}
            onBlur={() => onTouch('remoteCwd')}
            aria-invalid={!!shown('remoteCwd')}
            aria-describedby={shown('remoteCwd') ? `${uid}-remote-cwd-error` : `${uid}-remote-cwd-help`}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-white/[0.08] p-3" data-testid="remote-hostkey">
        <legend className="px-1 text-sm font-medium text-gray-300">{t('providerAdmin.remote.hostKeyLegend')}</legend>
        <p className="text-xs text-gray-500">
          {t('providerAdmin.remote.hostKeyIntro')}
        </p>

        {value.hostKeyKept ? (
          <p className="text-xs text-gray-300" data-testid="remote-hostkey-kept">
            {t('providerAdmin.remote.pinned')}{' '}
            <code className="break-all font-mono text-gray-100">{value.hostKeyFingerprint}</code>
            {t('providerAdmin.remote.pinnedTail')}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void fetchKey()}
                loading={fetching}
              >
                {t('providerAdmin.remote.fetchKey')}
              </Button>
              {fetchError && (
                <span role="alert" className="text-xs text-red-400">
                  {fetchError}
                </span>
              )}
            </div>
            <FormField
              id={`${uid}-host-key`}
              label={t('providerAdmin.remote.publicKey')}
              help={t('providerAdmin.remote.publicKeyHelp')}
              error={shown('hostKey') && hasKey ? shown('hostKey') : undefined}
            >
              <Input
                id={`${uid}-host-key`}
                value={value.hostKey}
                onChange={(e) =>
                  onChange({
                    hostKey: e.target.value,
                    hostKeyFingerprint: '',
                    hostKeyConfirmed: false,
                  })
                }
                onBlur={() => onTouch('hostKey')}
                aria-invalid={!!(shown('hostKey') && hasKey)}
                autoComplete="off"
                spellCheck={false}
              />
            </FormField>
            {hasKey && !validateHostKey(value.hostKey, t) && (
              <div className="space-y-2" data-testid="remote-fingerprint">
                {pasted ? (
                  <p className="text-xs text-amber-300">
                    {t('providerAdmin.remote.pasted')}
                  </p>
                ) : (
                  <p className="text-sm text-gray-200">
                    {t('providerAdmin.remote.fingerprint')}{' '}
                    <code className="break-all font-mono text-gray-100">{value.hostKeyFingerprint}</code>
                  </p>
                )}
                <label className="flex items-start gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={value.hostKeyConfirmed}
                    onChange={(e) => onChange({ hostKeyConfirmed: e.target.checked })}
                    className="mt-1"
                  />
                  <span>{t('providerAdmin.remote.confirmFingerprint')}</span>
                </label>
              </div>
            )}
          </>
        )}
      </fieldset>

      <div className="space-y-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
        <label className="flex items-start gap-2 text-sm text-gray-100">
          <input
            type="checkbox"
            checked={value.allowTrust}
            onChange={(e) => change({ allowTrust: e.target.checked })}
            className="mt-1"
          />
          <span>{t('providerAdmin.remote.allowTrust')}</span>
        </label>
        <p role="note" className="flex items-start gap-2 text-xs text-amber-200">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
          {t('providerAdmin.remote.trustWarning')}
        </p>
      </div>

      {!validateSshHost(value.host, t) && (
        <p className="text-xs text-gray-400">
          {t('providerAdmin.remote.origin')} <code data-testid="remote-origin" className="font-mono text-gray-200">{remoteOrigin(value.host, value.sshUser, value.sshPort)}</code>
          {t('providerAdmin.remote.originNote')}
        </p>
      )}
    </div>
  )
}
