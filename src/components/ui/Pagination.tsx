import { Select } from './Select'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
  className?: string
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = '',
}: PaginationProps) {
  const canGoPrev = currentPage > 1
  const canGoNext = currentPage < totalPages

  // Generate page numbers with ellipsis
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const pages: (number | 'ellipsis')[] = []

    // Always show first page
    pages.push(1)

    if (currentPage > 3) {
      pages.push('ellipsis')
    }

    // Pages around current page
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) {
        pages.push(i)
      }
    }

    if (currentPage < totalPages - 2) {
      pages.push('ellipsis')
    }

    // Always show last page
    if (!pages.includes(totalPages)) {
      pages.push(totalPages)
    }

    return pages
  }

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}>
      {/* Items info */}
      <div className="text-sm text-gray-400">
        {totalItems === 0 ? (
          'No items'
        ) : (
          <>
            Showing <span className="font-medium text-gray-200">{startItem}</span> to{' '}
            <span className="font-medium text-gray-200">{endItem}</span> of{' '}
            <span className="font-medium text-gray-200">{totalItems}</span> items
          </>
        )}
      </div>

      {/* Page size selector and navigation */}
      <div className="flex items-center gap-4">
        {/* Page size selector — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-sm text-gray-400 whitespace-nowrap">Per page:</span>
          <Select
            options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
            value={String(pageSize)}
            onChange={(val) => onPageSizeChange(Number(val))}
            className="w-20"
          />
        </div>

        {/* Navigation */}
        {totalPages > 1 && (
          <nav className="flex items-center gap-1">
            {/* Previous button */}
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={!canGoPrev}
              className={`px-3 py-2 md:py-1 rounded text-sm font-medium transition-colors ${
                canGoPrev
                  ? 'bg-white/[0.08] text-gray-200 hover:bg-white/[0.12]'
                  : 'bg-white/[0.03] text-gray-500 cursor-not-allowed'
              }`}
            >
              Prev
            </button>

            {/* Page numbers — hidden on mobile, show current/total instead */}
            <span className="sm:hidden text-sm text-gray-400">
              {currentPage} / {totalPages}
            </span>
            <div className="hidden sm:flex items-center gap-1">
              {getPageNumbers().map((page, index) =>
                page === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-gray-500">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => onPageChange(page)}
                    className={`min-w-[32px] px-2 py-1 rounded text-sm font-medium transition-colors ${
                      page === currentPage
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/[0.08] text-gray-200 hover:bg-white/[0.12]'
                    }`}
                  >
                    {page}
                  </button>
                )
              )}
            </div>

            {/* Next button */}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={!canGoNext}
              className={`px-3 py-2 md:py-1 rounded text-sm font-medium transition-colors ${
                canGoNext
                  ? 'bg-white/[0.08] text-gray-200 hover:bg-white/[0.12]'
                  : 'bg-white/[0.03] text-gray-500 cursor-not-allowed'
              }`}
            >
              Next
            </button>
          </nav>
        )}
      </div>
    </div>
  )
}
