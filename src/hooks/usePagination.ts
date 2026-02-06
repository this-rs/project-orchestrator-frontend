import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

interface UsePaginationOptions {
  defaultPageSize?: number
  defaultPage?: number
}

interface UsePaginationReturn {
  page: number
  pageSize: number
  offset: number
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  totalPages: (total: number) => number
  paginationProps: (total: number) => {
    currentPage: number
    totalPages: number
    totalItems: number
    pageSize: number
    onPageChange: (page: number) => void
    onPageSizeChange: (size: number) => void
  }
}

export function usePagination(options: UsePaginationOptions = {}): UsePaginationReturn {
  const { defaultPageSize = 25, defaultPage = 1 } = options
  const [searchParams, setSearchParams] = useSearchParams()

  const page = useMemo(() => {
    const pageParam = searchParams.get('page')
    const parsed = pageParam ? parseInt(pageParam, 10) : defaultPage
    return isNaN(parsed) || parsed < 1 ? defaultPage : parsed
  }, [searchParams, defaultPage])

  const pageSize = useMemo(() => {
    const limitParam = searchParams.get('limit')
    const parsed = limitParam ? parseInt(limitParam, 10) : defaultPageSize
    return isNaN(parsed) || parsed < 1 ? defaultPageSize : parsed
  }, [searchParams, defaultPageSize])

  const offset = useMemo(() => (page - 1) * pageSize, [page, pageSize])

  const setPage = useCallback(
    (newPage: number) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        if (newPage === 1) {
          params.delete('page')
        } else {
          params.set('page', String(newPage))
        }
        return params
      })
    },
    [setSearchParams]
  )

  const setPageSize = useCallback(
    (newSize: number) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        if (newSize === defaultPageSize) {
          params.delete('limit')
        } else {
          params.set('limit', String(newSize))
        }
        // Reset to page 1 when changing page size
        params.delete('page')
        return params
      })
    },
    [setSearchParams, defaultPageSize]
  )

  const totalPages = useCallback(
    (total: number) => Math.ceil(total / pageSize),
    [pageSize]
  )

  const paginationProps = useCallback(
    (total: number) => ({
      currentPage: page,
      totalPages: Math.ceil(total / pageSize),
      totalItems: total,
      pageSize,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    }),
    [page, pageSize, setPage, setPageSize]
  )

  return {
    page,
    pageSize,
    offset,
    setPage,
    setPageSize,
    totalPages,
    paginationProps,
  }
}
