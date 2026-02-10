import { useAtom } from 'jotai'
import { setupConfigAtom } from '@/atoms/setup'

export function InfrastructurePage() {
  const [config, setConfig] = useAtom(setupConfigAtom)

  const update = (patch: Partial<typeof config>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Infrastructure</h2>
        <p className="mt-1 text-sm text-gray-400">
          Choose how to run the required services (Neo4j &amp; MeiliSearch).
        </p>
      </div>

      {/* Mode selection */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ModeCard
          active={config.infraMode === 'docker'}
          onClick={() => update({ infraMode: 'docker' })}
          title="Docker (recommended)"
          description="Automatically start Neo4j and MeiliSearch in Docker containers. Requires Docker Desktop."
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
            </svg>
          }
        />
        <ModeCard
          active={config.infraMode === 'external'}
          onClick={() => update({ infraMode: 'external' })}
          title="External servers"
          description="Connect to existing Neo4j and MeiliSearch instances running elsewhere."
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          }
        />
      </div>

      {/* External servers config */}
      {config.infraMode === 'external' && (
        <div className="space-y-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <div>
            <h3 className="text-sm font-medium text-gray-300">Neo4j Connection</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label="URI"
                value={config.neo4jUri}
                onChange={(v) => update({ neo4jUri: v })}
                placeholder="bolt://localhost:7687"
              />
              <Field
                label="User"
                value={config.neo4jUser}
                onChange={(v) => update({ neo4jUser: v })}
                placeholder="neo4j"
              />
              <Field
                label="Password"
                type="password"
                value={config.neo4jPassword}
                onChange={(v) => update({ neo4jPassword: v })}
                placeholder="Enter password"
                className="sm:col-span-2"
              />
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-6">
            <h3 className="text-sm font-medium text-gray-300">MeiliSearch Connection</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label="URL"
                value={config.meilisearchUrl}
                onChange={(v) => update({ meilisearchUrl: v })}
                placeholder="http://localhost:7700"
              />
              <Field
                label="API Key"
                type="password"
                value={config.meilisearchKey}
                onChange={(v) => update({ meilisearchKey: v })}
                placeholder="Master key"
              />
            </div>
          </div>
        </div>
      )}

      {/* Docker info */}
      {config.infraMode === 'docker' && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5">
          <div className="flex gap-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <div className="text-sm text-gray-300">
              <p className="font-medium text-indigo-400">Docker mode</p>
              <p className="mt-1">
                Neo4j and MeiliSearch will be started automatically as Docker containers.
                Make sure Docker Desktop is running on your machine.
              </p>
              <p className="mt-2 text-gray-500">
                Ports: Neo4j (7474, 7687) &middot; MeiliSearch (7700) &middot; API ({config.serverPort})
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Server port */}
      <div>
        <Field
          label="API Server Port"
          type="number"
          value={String(config.serverPort)}
          onChange={(v) => update({ serverPort: parseInt(v) || 8080 })}
          placeholder="8080"
          className="max-w-[200px]"
        />
        <p className="mt-1.5 text-xs text-gray-500">
          Port for the backend API server and frontend.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Reusable sub-components
// ============================================================================

function ModeCard({
  active,
  onClick,
  title,
  description,
  icon,
}: {
  active: boolean
  onClick: () => void
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition ${
        active
          ? 'border-indigo-500/50 bg-indigo-500/10'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          active ? 'bg-indigo-600 text-white' : 'bg-white/[0.06] text-gray-400'
        }`}
      >
        {icon}
      </div>
      <div>
        <div className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-300'}`}>
          {title}
        </div>
        <div className="mt-1 text-xs text-gray-500">{description}</div>
      </div>
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-gray-600 transition focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
      />
    </div>
  )
}
