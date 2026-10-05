/**
 * UpdatesSection — manual "Check for updates" for the desktop app.
 *
 * Wraps the Tauri `check_update` command (stored server-side so that
 * `install_update` can pick it up). Download progress and the restart notice
 * are rendered by the app-level UpdateBanner, which listens to the events
 * emitted by `install_update`.
 */
import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { Switch } from '@/components/ui/Switch'
import { chatApi } from '@/services/chat'
import { apiErrorMessage } from '@/services/api'

interface AvailableUpdate {
  version: string
  body: string | null
  date: string | null
}

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; update: AvailableUpdate }
  | { kind: 'installing' }
  | { kind: 'error'; message: string }

async function invoke<T>(cmd: string): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd)
}

export function UpdatesSection() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  // `chat.auto_update_app` — read live by the desktop update checker, so a change applies without a restart.
  const [auto, setAuto] = useState<boolean | null>(null)
  const [autoError, setAutoError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    chatApi
      .getChatConfig()
      .then((c) => alive && setAuto(c.auto_update_app))
      .catch((e) => alive && setAutoError(apiErrorMessage(e, 'Could not read the setting')))
    return () => {
      alive = false
    }
  }, [])

  const toggleAuto = useCallback(async (next: boolean) => {
    setAuto(next) // optimistic
    setAutoError(null)
    try {
      const saved = await chatApi.updateChatConfig({ auto_update_app: next })
      setAuto(saved.auto_update_app)
    } catch (e) {
      setAuto(!next) // roll back to what is really stored
      setAutoError(apiErrorMessage(e, 'Could not save the setting'))
    }
  }, [])

  const check = useCallback(async () => {
    setState({ kind: 'checking' })
    try {
      const update = await invoke<AvailableUpdate | null>('check_update')
      setState(update ? { kind: 'available', update } : { kind: 'up-to-date' })
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const install = useCallback(async () => {
    setState({ kind: 'installing' })
    try {
      await invoke('install_update')
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const busy = state.kind === 'checking' || state.kind === 'installing'

  return (
    <div data-testid="updates-section">
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1 text-sm" role="status" aria-live="polite">
        {state.kind === 'idle' && <span className="text-gray-400">Look for a newer version of the app.</span>}
        {state.kind === 'checking' && <span className="text-gray-400">Checking…</span>}
        {state.kind === 'up-to-date' && <span className="text-gray-300">You are up to date.</span>}
        {state.kind === 'available' && (
          <span className="text-gray-200">Version {state.update.version} is available.</span>
        )}
        {state.kind === 'installing' && (
          <span className="text-gray-300">Downloading and installing — the app will restart.</span>
        )}
        {state.kind === 'error' && <span className="text-red-400">Update check failed: {state.message}</span>}
      </div>
      {state.kind === 'available' ? (
        <Button size="sm" onClick={install}>
          <Download className="w-4 h-4 mr-1.5" aria-hidden="true" />
          Update now
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={check} disabled={busy}>
          {busy ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1.5" aria-hidden="true" />
          )}
          Check for updates
        </Button>
      )}
    </div>
      <div className="border-t border-white/[0.06] px-4 py-2">
        <Switch
          label="Check for updates automatically (at launch, then every few hours)"
          checked={auto ?? true}
          disabled={auto === null}
          onChange={toggleAuto}
        />
        {autoError && (
          <p className="pb-1 text-xs text-red-400" role="alert">
            {autoError}
          </p>
        )}
      </div>
    </div>
  )
}
