/**
 * Note lifecycle forms (edit / invalidate / supersede / link), rendered inside
 * a <FormDialog>. Each hook returns `{ fields, submit, reset }` like the other
 * forms of this folder; `submit` returns `false` to keep the dialog open.
 */
import { useState } from 'react'
import { Input, Select, Textarea } from '@/components/ui'
import type { NoteImportance, NoteType } from '@/types'
import { noteTypeOptions } from '@/components/knowledge/noteMeta'

const importanceOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const parseTags = (raw: string) =>
  raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

// ── Edit ────────────────────────────────────────────────────────────────

export interface EditNoteFormData {
  content: string
  importance: NoteImportance
  tags: string[]
}

export function useEditNoteForm(onSubmit: (data: EditNoteFormData) => Promise<void>) {
  const [content, setContent] = useState('')
  const [importance, setImportance] = useState<NoteImportance>('medium')
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string | undefined>()

  return {
    reset: (initial: { content: string; importance: NoteImportance; tags: string[] }) => {
      setContent(initial.content)
      setImportance(initial.importance)
      setTags(initial.tags.join(', '))
      setError(undefined)
    },
    fields: (
      <>
        <Textarea
          label="Content (markdown)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          error={error}
          rows={10}
          autoFocus
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Importance"
            options={importanceOptions}
            value={importance}
            onChange={(v) => setImportance(v as NoteImportance)}
          />
          <Input label="Tags" placeholder="Comma-separated tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
      </>
    ),
    submit: async () => {
      if (!content.trim()) {
        setError('Content is required')
        return false
      }
      await onSubmit({ content: content.trim(), importance, tags: parseTags(tags) })
    },
  }
}

// ── Invalidate ──────────────────────────────────────────────────────────

export function useInvalidateNoteForm(onSubmit: (reason: string) => Promise<void>) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  return {
    reset: () => {
      setReason('')
      setError(undefined)
    },
    fields: (
      <>
        <p className="text-sm text-gray-400">
          Marks the note as obsolete: agents stop receiving it. Say why, so the history explains it.
        </p>
        <Textarea
          label="Reason"
          placeholder="e.g. The retry logic was removed in the v2 client"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={error}
          rows={3}
          autoFocus
        />
      </>
    ),
    submit: async () => {
      if (!reason.trim()) {
        setError('A reason is required')
        return false
      }
      await onSubmit(reason.trim())
    },
  }
}

// ── Supersede ───────────────────────────────────────────────────────────

export interface SupersedeNoteFormData {
  note_type: NoteType
  content: string
  importance: NoteImportance
  tags: string[]
}

export function useSupersedeNoteForm(onSubmit: (data: SupersedeNoteFormData) => Promise<void>) {
  const [noteType, setNoteType] = useState<NoteType>('guideline')
  const [content, setContent] = useState('')
  const [importance, setImportance] = useState<NoteImportance>('medium')
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string | undefined>()

  return {
    reset: (initial: SupersedeNoteFormData) => {
      setNoteType(initial.note_type)
      setContent(initial.content)
      setImportance(initial.importance)
      setTags(initial.tags.join(', '))
      setError(undefined)
    },
    fields: (
      <>
        <p className="text-sm text-gray-400">
          Creates a new version of this note. The current one is kept for history and marked as superseded.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Type" options={noteTypeOptions} value={noteType} onChange={(v) => setNoteType(v as NoteType)} />
          <Select
            label="Importance"
            options={importanceOptions}
            value={importance}
            onChange={(v) => setImportance(v as NoteImportance)}
          />
        </div>
        <Textarea
          label="New content (markdown)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          error={error}
          rows={10}
          autoFocus
        />
        <Input label="Tags" placeholder="Comma-separated tags" value={tags} onChange={(e) => setTags(e.target.value)} />
      </>
    ),
    submit: async () => {
      if (!content.trim()) {
        setError('Content is required')
        return false
      }
      await onSubmit({ note_type: noteType, content: content.trim(), importance, tags: parseTags(tags) })
    },
  }
}

// ── Link to an entity ───────────────────────────────────────────────────

const linkTypeOptions = [
  { value: 'file', label: 'File' },
  { value: 'function', label: 'Function' },
  { value: 'struct', label: 'Struct' },
  { value: 'trait', label: 'Trait' },
  { value: 'module', label: 'Module' },
  { value: 'task', label: 'Task' },
  { value: 'plan', label: 'Plan' },
  { value: 'decision', label: 'Decision' },
  { value: 'skill', label: 'Skill' },
  { value: 'protocol', label: 'Protocol' },
  { value: 'feature_graph', label: 'Feature graph' },
]

export function useLinkNoteEntityForm(onSubmit: (entityType: string, entityId: string) => Promise<void>) {
  const [entityType, setEntityType] = useState('file')
  const [entityId, setEntityId] = useState('')
  const [error, setError] = useState<string | undefined>()
  return {
    reset: () => {
      setEntityType('file')
      setEntityId('')
      setError(undefined)
    },
    fields: (
      <>
        <Select label="Entity type" options={linkTypeOptions} value={entityType} onChange={setEntityType} />
        <Input
          label="Entity"
          placeholder={entityType === 'file' ? 'src/api/handlers.rs' : entityType === 'function' ? 'function name' : 'ID'}
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          error={error}
          autoFocus
        />
      </>
    ),
    submit: async () => {
      if (!entityId.trim()) {
        setError('Required')
        return false
      }
      await onSubmit(entityType, entityId.trim())
    },
  }
}
