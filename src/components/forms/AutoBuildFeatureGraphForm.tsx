import { useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { AutoBuildFeatureGraphRequest } from '@/types'

interface Props {
  projects: { id: string; name: string }[]
  onSubmit: (data: AutoBuildFeatureGraphRequest) => Promise<void>
}

const RELATION_OPTIONS = [
  { key: 'CALLS', label: 'Calls', defaultOn: true },
  { key: 'IMPORTS', label: 'Imports', defaultOn: true },
  { key: 'EXTENDS', label: 'Extends', defaultOn: false },
  { key: 'IMPLEMENTS', label: 'Implements', defaultOn: false },
]

export function AutoBuildFeatureGraphForm({ projects, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [entryFunction, setEntryFunction] = useState('')
  const [depth, setDepth] = useState(2)
  const [relations, setRelations] = useState<Record<string, boolean>>(
    Object.fromEntries(RELATION_OPTIONS.map((r) => [r.key, r.defaultOn])),
  )
  const [filterCommunity, setFilterCommunity] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))

  const toggleRelation = (key: string) => {
    setRelations((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    if (!projectId) errs.project_id = 'Project is required'
    if (!entryFunction.trim()) errs.entry_function = 'Entry function is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <div className="space-y-4">
        <Select
          label="Project"
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
          error={errors.project_id}
        />
        <Input
          label="Name"
          placeholder="Feature graph name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="Describe this feature graph..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />

        <div className="border-t border-white/[0.06] pt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Build Configuration</h4>

          <Input
            label="Entry Function"
            placeholder="e.g. handle_request"
            value={entryFunction}
            onChange={(e) => setEntryFunction(e.target.value)}
            error={errors.entry_function}
          />

          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Depth <span className="text-gray-500 font-normal">({depth})</span>
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-0.5">
              <span>1 (focused)</span>
              <span>5 (broad)</span>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Include Relations</label>
            <div className="flex flex-wrap gap-2">
              {RELATION_OPTIONS.map((rel) => (
                <button
                  key={rel.key}
                  type="button"
                  onClick={() => toggleRelation(rel.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    relations[rel.key]
                      ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
                      : 'bg-white/[0.04] text-gray-500 hover:bg-white/[0.08]'
                  }`}
                >
                  {rel.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2.5 mt-4 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={filterCommunity}
                onChange={(e) => setFilterCommunity(e.target.checked)}
                className="peer sr-only"
              />
              <div className="w-8 h-5 bg-white/[0.08] rounded-full peer-checked:bg-indigo-500/60 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-gray-300 rounded-full peer-checked:translate-x-3 peer-checked:bg-white transition-transform" />
            </div>
            <div>
              <span className="text-sm text-gray-300 group-hover:text-gray-200 transition-colors">
                Filter by community
              </span>
              <p className="text-xs text-gray-500">
                Only include functions in the same Louvain community as the entry point
              </p>
            </div>
          </label>
        </div>
      </div>
    ),
    submit: async () => {
      if (!validate()) return false
      const selectedRelations = Object.entries(relations)
        .filter(([, on]) => on)
        .map(([key]) => key)
      await onSubmit({
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || undefined,
        entry_function: entryFunction.trim(),
        depth,
        include_relations: selectedRelations.length > 0 ? selectedRelations : undefined,
        filter_community: filterCommunity,
      })
    },
  }
}
