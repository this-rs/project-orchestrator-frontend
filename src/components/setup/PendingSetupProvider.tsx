import { useEffect, useRef } from 'react'
import { useAtom } from 'jotai'
import { pendingSetupProviderAtom } from '@/atoms/setupProvider'
import { ApiError } from '@/services/api'
import { providersApi } from '@/services/providers'
import { useToast } from '@/hooks'
import { pendingToDraft } from '@/constants/setupProviderDraft'

/**
 * Creates the provider the setup wizard chose, once the app runs and the API answers.
 *
 * One attempt per start of the app. A person who is not logged in yet gets a 401/403:
 * the choice stays pending and the next start tries again. An id already taken (409)
 * means the provider exists: the choice is done.
 */
export function PendingSetupProvider() {
  const [pending, setPending] = useAtom(pendingSetupProviderAtom)
  const toast = useToast()
  const attempted = useRef(false)

  useEffect(() => {
    if (!pending || attempted.current) return
    attempted.current = true
    providersApi
      .create(pendingToDraft(pending))
      .then(() => {
        setPending(null)
        toast.success(`${pending.label} added`)
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          setPending(null)
          return
        }
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          // Not logged in yet: keep the choice for the next start.
          return
        }
        toast.error(`${pending.label} could not be added: ${err instanceof Error ? err.message : String(err)}`)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one attempt per app start
  }, [pending])

  return null
}
