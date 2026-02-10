import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { authTokenAtom, currentUserAtom } from '@/atoms'
import { authApi } from '@/services'
import { Button, Input } from '@/components/ui'

/**
 * Registration form with client-side validation.
 * On success: auto-login (sets token + user) and navigates to /workspaces.
 */
export function RegisterForm() {
  const navigate = useNavigate()
  const setToken = useSetAtom(authTokenAtom)
  const setUser = useSetAtom(currentUserAtom)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // Client-side validation
    const trimmedEmail = email.trim()
    const trimmedName = name.trim()

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address')
      return
    }
    if (!trimmedName) {
      setError('Please enter your name')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const { token, user } = await authApi.register(trimmedEmail, password, trimmedName)
      setToken(token)
      setUser(user)
      navigate('/workspaces', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="email"
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <Input
        type="text"
        label="Name"
        placeholder="Your full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        required
      />
      <Input
        type="password"
        label="Password"
        placeholder="Minimum 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
      />
      <Input
        type="password"
        label="Confirm password"
        placeholder="Enter password again"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        required
      />

      {error && (
        <div className="rounded-lg bg-red-900/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <Button type="submit" loading={loading} className="w-full">
        Create account
      </Button>
    </form>
  )
}
