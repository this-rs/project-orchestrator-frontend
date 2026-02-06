import { Link } from 'react-router-dom'

interface LinkedEntityBadgeProps {
  label: string
  entityType?: string
  onUnlink: () => Promise<void> | void
  linkTo?: string
}

export function LinkedEntityBadge({ label, entityType, onUnlink, linkTo }: LinkedEntityBadgeProps) {
  const content = (
    <>
      {entityType && <span className="text-gray-500 mr-1">{entityType}:</span>}
      <span className="text-gray-200">{label}</span>
    </>
  )

  return (
    <span className="inline-flex items-center gap-2 bg-white/[0.06] rounded-lg px-3 py-1.5 text-sm">
      {linkTo ? (
        <Link to={linkTo} className="hover:text-indigo-400 transition-colors">
          {content}
        </Link>
      ) : (
        content
      )}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onUnlink()
        }}
        className="text-gray-500 hover:text-red-400 transition-colors"
        title="Unlink"
      >
        &times;
      </button>
    </span>
  )
}
