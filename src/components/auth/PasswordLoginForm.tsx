import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { authTokenAtom, currentUserAtom } from '@/atoms'
import { authApi, setAuthToken } from '@/services'
import { useT } from '@/i18n'
import { Button, Input, StatusIcon, TONE_CLASSES } from '@/components/ui'

/**
 * Email/password login form.
 * On success: sets token + user atoms and navigates to /workspaces.
 */
export function PasswordLoginForm() {
  const navigate = useNavigate()
  const { t } = useT()
  const setToken = useSetAtom(authTokenAtom)
  const setUser = useSetAtom(currentUserAtom)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // Client-side validation
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(t('auth.form.invalidEmail'))
      return
    }
    if (!password) {
      setError(t('auth.form.passwordRequired'))
      return
    }

    setLoading(true)
    try {
      const { token, user } = await authApi.loginWithPassword(trimmedEmail, password)
      setAuthToken(token) // Module-level cache for api.ts Bearer header
      setToken(token)
      setUser(user)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.form.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="email"
        label={t('auth.form.email')}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <Input
        type="password"
        label={t('auth.form.password')}
        placeholder={t('auth.form.passwordPlaceholder')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />

      {error && (
        <p role="alert" className={`flex items-start gap-1.5 text-sm ${TONE_CLASSES.danger.text}`}>
          <StatusIcon tone="danger" className="mt-0.5" />
          <span className="min-w-0 break-words">{error}</span>
        </p>
      )}

      <Button type="submit" loading={loading} className="w-full">
        {t('auth.form.signIn')}
      </Button>
    </form>
  )
}
