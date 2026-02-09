import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { authTokenAtom, currentUserAtom } from '@/atoms'
import { authApi } from '@/services'
import { Spinner } from '@/components/ui'

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setToken = useSetAtom(authTokenAtom)
  const setUser = useSetAtom(currentUserAtom)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      setError('Missing authorization code')
      return
    }

    let cancelled = false

    authApi
      .exchangeCode(code)
      .then(({ token, user }) => {
        if (cancelled) return
        setToken(token)
        setUser(user)
        navigate('/workspaces', { replace: true })
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Authentication failed')
      })

    return () => {
      cancelled = true
    }
  }, [searchParams, navigate, setToken, setUser])

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-950">
        <div className="w-full max-w-sm space-y-6 px-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-900/50">
            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Authentication failed</h2>
            <p className="mt-2 text-sm text-gray-400">{error}</p>
          </div>
          <Link
            to="/login"
            className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-950">
      <div className="space-y-4 text-center">
        <Spinner size="lg" />
        <p className="text-sm text-gray-400">Signing you in...</p>
      </div>
    </div>
  )
}
