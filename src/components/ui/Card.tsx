interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  /** Enable content-visibility: auto for off-screen rendering skip (use in long lists) */
  lazy?: boolean | 'sm' | 'lg'
}

export function Card({ children, className = '', onClick, lazy }: CardProps) {
  const cvClass = lazy === true ? 'cv-auto' : lazy === 'sm' ? 'cv-auto-sm' : lazy === 'lg' ? 'cv-auto-lg' : ''
  return (
    <div
      className={`glass rounded-xl shadow-sm overflow-hidden scroll-reveal ${onClick ? 'cursor-pointer card-hover' : ''} ${cvClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-4 py-3 border-b border-border-subtle ${className}`}>{children}</div>
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`font-semibold text-gray-100 ${className}`} style={{ fontSize: 'var(--fluid-lg)' }}>{children}</h3>
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>
}

export function CardFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-4 py-3 border-t border-border-subtle ${className}`}>{children}</div>
}
