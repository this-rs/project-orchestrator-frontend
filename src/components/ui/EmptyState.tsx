interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-white/[0.06] rounded-2xl">
      {icon && (
        <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center text-gray-500 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-200 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-4 max-w-xs sm:max-w-md">{description}</p>}
      {action}
    </div>
  )
}
