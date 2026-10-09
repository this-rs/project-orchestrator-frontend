/**
 * Note lifecycle forms (edit / invalidate / supersede / link), rendered inside
 * a <FormDialog>. Each hook returns `{ fields, submit, reset }` like the other
 * forms of this folder; `submit` returns `false` to keep the dialog open.
 */
import { useState } from 'react'
import { Input, Select, Textarea } from '@/components/ui'
import type { NoteImportance, NoteType } from '@/types'
import { noteTypeOptions } from '@/components/knowledge/noteMeta'
import { useT } from '@/i18n'

/** Importance choices, labelled in the language on screen. */
function useImportanceOptions() {
  const { t } = useT()
  return [
    { value: 'low', label: t('ui.status.low') },
    { value: 'medium', label: t('ui.status.medium') },
    { value: 'high', label: t('ui.status.high') },
    { value: 'critical', label: t('ui.status.critical') },
  ]
}

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
  const { t } = useT()
  const importanceOptions = useImportanceOptions()
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
          label={t('forms.note.contentMarkdown')}
          aria-label={t('forms.field.content')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          error={error}
          rows={10}
          autoFocus
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label={t('forms.field.importance')}
            options={importanceOptions}
            value={importance}
            onChange={(v) => setImportance(v as NoteImportance)}
          />
          <Input label={t('forms.field.tags')} placeholder={t('forms.placeholder.tags')} value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
      </>
    ),
    submit: async () => {
      if (!content.trim()) {
        setError(t('forms.error.content'))
        return false
      }
      await onSubmit({ content: content.trim(), importance, tags: parseTags(tags) })
    },
  }
}

// ── Invalidate ──────────────────────────────────────────────────────────

export function useInvalidateNoteForm(onSubmit: (reason: string) => Promise<void>) {
  const { t } = useT()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  return {
    reset: () => {
      setReason('')
      setError(undefined)
    },
    fields: (
      <>
        <p className="text-sm text-gray-400">{t('forms.note.invalidateIntro')}</p>
        <Textarea
          label={t('forms.field.reason')}
          aria-label={t('forms.field.reason')}
          placeholder={t('forms.placeholder.invalidateReason')}
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
        setError(t('forms.error.reason'))
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
  const { t } = useT()
  const importanceOptions = useImportanceOptions()
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
        <p className="text-sm text-gray-400">{t('forms.note.supersedeIntro')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={t('forms.field.type')} options={noteTypeOptions} value={noteType} onChange={(v) => setNoteType(v as NoteType)} />
          <Select
            label={t('forms.field.importance')}
            options={importanceOptions}
            value={importance}
            onChange={(v) => setImportance(v as NoteImportance)}
          />
        </div>
        <Textarea
          label={t('forms.note.newContentMarkdown')}
          aria-label={t('forms.note.newContent')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          error={error}
          rows={10}
          autoFocus
        />
        <Input label={t('forms.field.tags')} placeholder={t('forms.placeholder.tags')} value={tags} onChange={(e) => setTags(e.target.value)} />
      </>
    ),
    submit: async () => {
      if (!content.trim()) {
        setError(t('forms.error.content'))
        return false
      }
      await onSubmit({ note_type: noteType, content: content.trim(), importance, tags: parseTags(tags) })
    },
  }
}

// ── Link to an entity ───────────────────────────────────────────────────

export function useLinkNoteEntityForm(onSubmit: (entityType: string, entityId: string) => Promise<void>) {
  const { t } = useT()
  const linkTypeOptions = [
    { value: 'file', label: t('forms.entityType.file') },
    { value: 'function', label: t('forms.entityType.function') },
    { value: 'struct', label: t('forms.entityType.struct') },
    { value: 'trait', label: t('forms.entityType.trait') },
    { value: 'module', label: t('forms.entityType.module') },
    { value: 'task', label: t('forms.entityType.task') },
    { value: 'plan', label: t('forms.entityType.plan') },
    { value: 'decision', label: t('forms.entityType.decision') },
    { value: 'skill', label: t('forms.entityType.skill') },
    { value: 'protocol', label: t('forms.entityType.protocol') },
    { value: 'feature_graph', label: t('forms.entityType.feature_graph') },
  ]
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
        <Select label={t('forms.field.entityType')} options={linkTypeOptions} value={entityType} onChange={setEntityType} />
        <Input
          label={t('forms.field.entity')}
          placeholder={entityType === 'file' ? 'src/api/handlers.rs' : entityType === 'function' ? t('forms.placeholder.functionName') : t('forms.placeholder.id')}
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          error={error}
          autoFocus
        />
      </>
    ),
    submit: async () => {
      if (!entityId.trim()) {
        setError(t('forms.error.required'))
        return false
      }
      await onSubmit(entityType, entityId.trim())
    },
  }
}
