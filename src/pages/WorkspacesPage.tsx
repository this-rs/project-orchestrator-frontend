import { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { Link } from 'react-router-dom'
import { workspacesAtom, workspacesLoadingAtom } from '@/atoms'
import { workspacesApi } from '@/services'
import { Card, CardContent, Button, LoadingPage, EmptyState, Pagination, ConfirmDialog, FormDialog, OverflowMenu, PageShell, SelectCheckbox, BulkActionBar } from '@/components/ui'
import { usePagination, useConfirmDialog, useFormDialog, useToast, useMultiSelect } from '@/hooks'
import { CreateWorkspaceForm } from '@/components/forms'
import type { Workspace } from '@/types'

export function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useAtom(workspacesAtom)
  const [loading, setLoading] = useAtom(workspacesLoadingAtom)
  const [total, setTotal] = useState(0)
  const { page, pageSize, offset, paginationProps } = usePagination()
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const toast = useToast()
  const [formLoading, setFormLoading] = useState(false)

  const fetchWorkspaces = async () => {
    setLoading(true)
    try {
      const response = await workspacesApi.list({ limit: pageSize, offset })
      setWorkspaces(response.items || [])
      setTotal(response.total || 0)
    } catch (error) {
      console.error('Failed to fetch workspaces:', error)
      toast.error('Failed to load workspaces')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkspaces()
  }, [setWorkspaces, setLoading, page, pageSize, offset])

  const form = CreateWorkspaceForm({
    onSubmit: async (data) => {
      setFormLoading(true)
      try {
        await workspacesApi.create(data)
        toast.success('Workspace created')
        formDialog.close()
        fetchWorkspaces()
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const openCreateDialog = () => {
    formDialog.open({ title: 'Create Workspace' })
  }

  const multiSelect = useMultiSelect(workspaces, (w) => w.slug)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: `Delete ${count} workspace${count > 1 ? 's' : ''}`,
      description: `This will permanently delete ${count} workspace${count > 1 ? 's' : ''}. Projects will not be deleted.`,
      onConfirm: async () => {
        const items = multiSelect.selectedItems
        confirmDialog.setProgress({ current: 0, total: items.length })
        for (let i = 0; i < items.length; i++) {
          await workspacesApi.delete(items[i].slug)
          confirmDialog.setProgress({ current: i + 1, total: items.length })
        }
        setWorkspaces((prev) => prev.filter((w) => !multiSelect.selectedIds.has(w.slug)))
        setTotal((prev) => prev - items.length)
        multiSelect.clear()
        toast.success(`Deleted ${count} workspace${count > 1 ? 's' : ''}`)
      },
    })
  }

  if (loading) return <LoadingPage />

  return (
    <PageShell
      title="Workspaces"
      description="Organize your projects into workspaces"
      actions={<Button onClick={openCreateDialog}>Create Workspace</Button>}
    >
      {workspaces.length === 0 && total === 0 ? (
        <EmptyState
          title="No workspaces"
          description="Create a workspace to group related projects together."
          action={<Button onClick={openCreateDialog}>Create Workspace</Button>}
        />
      ) : (
        <>
          {workspaces.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={multiSelect.toggleAll}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {multiSelect.isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                selected={multiSelect.isSelected(workspace.slug)}
                onToggleSelect={() => multiSelect.toggle(workspace.slug)}
                key={workspace.id}
                workspace={workspace}
                onDelete={() => confirmDialog.open({
                  title: 'Delete Workspace',
                  description: 'This will permanently delete this workspace.',
                  onConfirm: async () => {
                    await workspacesApi.delete(workspace.slug)
                    setWorkspaces(prev => prev.filter(w => w.id !== workspace.id))
                    toast.success('Workspace deleted')
                  },
                })}
              />
            ))}
          </div>
          <div className="mt-6">
            <Pagination {...paginationProps(total)} />
          </div>
        </>
      )}

      <BulkActionBar
        count={multiSelect.selectionCount}
        onDelete={handleBulkDelete}
        onClear={multiSelect.clear}
      />
      <FormDialog {...formDialog.dialogProps} onSubmit={form.submit} loading={formLoading}>
        {form.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

function WorkspaceCard({ workspace, onDelete, selected, onToggleSelect }: { workspace: Workspace; onDelete: () => void; selected?: boolean; onToggleSelect?: () => void }) {
  return (
    <Link to={`/workspaces/${workspace.slug}`}>
      <Card className="h-full hover:border-indigo-500 transition-colors">
        <div className="h-0.5 bg-indigo-500/50" />
        <CardContent>
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-1">
              {onToggleSelect && (
                <SelectCheckbox checked={!!selected} onChange={onToggleSelect} />
              )}
              <h3 className="text-lg font-semibold text-gray-100">{workspace.name}</h3>
            </div>
            <OverflowMenu
              actions={[
                { label: 'Delete', variant: 'danger', onClick: () => onDelete() },
              ]}
            />
          </div>
          {workspace.description && (
            <p className="text-sm text-gray-400 line-clamp-2">{workspace.description}</p>
          )}
          <div className="mt-4 text-xs text-gray-500">
            Created {new Date(workspace.created_at).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
