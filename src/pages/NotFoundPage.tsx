import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui'

interface NotFoundPageProps {
  /** When true, renders without full-screen background and logo — for use inside MainLayout */
  embedded?: boolean
}

export function NotFoundPage({ embedded = false }: NotFoundPageProps) {
  const navigate = useNavigate()

  const content = (
    <div className="relative flex flex-col items-center text-center animate-[fadeInUp_0.6s_ease-out]">
      {/* Radial glow behind the 404 */}
      <div className="pointer-events-none absolute -top-24 h-64 w-64 rounded-full bg-indigo-500/[0.07] blur-3xl sm:h-80 sm:w-80" />

      {/* Big 404 — layered for depth */}
      <div className="relative">
        {/* Ghost shadow text behind */}
        <span
          aria-hidden="true"
          className="absolute inset-0 select-none bg-gradient-to-b from-white/[0.03] to-transparent bg-clip-text text-8xl font-black tracking-tighter text-transparent blur-sm sm:text-[10rem] lg:text-[12rem]"
        >
          404
        </span>
        <h1 className="relative bg-gradient-to-b from-indigo-300 via-indigo-400 to-indigo-600 bg-clip-text text-8xl font-black tracking-tighter text-transparent sm:text-[10rem] lg:text-[12rem]">
          404
        </h1>
      </div>

      {/* Divider line */}
      <div className="mt-2 h-px w-16 bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent sm:w-24" />

      {/* Title */}
      <h2 className="mt-5 text-lg font-semibold text-gray-100 sm:text-xl">
        Page not found
      </h2>

      {/* Description */}
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-gray-400 sm:max-w-sm sm:text-base">
        The page you&apos;re looking for doesn&apos;t exist, has been moved, or
        you may not have permission to view it.
      </p>

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" onClick={() => navigate('/')}>
          <Home className="-ml-0.5 mr-2 h-4 w-4" />
          Back to home
        </Button>
        <Button variant="secondary" onClick={() => navigate(-1 as never)}>
          <ArrowLeft className="-ml-0.5 mr-2 h-4 w-4" />
          Go back
        </Button>
      </div>
    </div>
  )

  // Embedded mode: integrates within MainLayout's content area
  if (embedded) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-20">
        {content}
      </div>
    )
  }

  // Full-screen mode: standalone page with background effects and branding
  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-[var(--surface-base)]">
      {/* Background dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Logo */}
      <div className="absolute top-8 animate-[fadeInUp_0.4s_ease-out]">
        <img
          src="/logo-192.png"
          alt="Project Orchestrator"
          className="h-10 w-10 rounded-xl opacity-60 transition-opacity hover:opacity-100 sm:h-12 sm:w-12"
        />
      </div>

      {content}

      {/* Branding */}
      <div className="absolute bottom-6 text-center text-xs tracking-wide animate-[fadeInUp_0.8s_ease-out]">
        <div className="text-gray-700">Made by</div>
        <div className="text-gray-600">Freedom From Scratch</div>
      </div>
    </div>
  )
}
