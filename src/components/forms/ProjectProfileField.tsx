import { useId } from 'react'
import { ChoiceRow } from '@/components/settings/FormField'
import { PROJECT_PROFILES, PROJECT_PROFILE_TEXT } from '@/constants/projectProfile'
import type { ProjectProfile } from '@/types'

interface Props {
  value: ProjectProfile
  onChange: (profile: ProjectProfile) => void
  disabled?: boolean
}

/**
 * The first question of a project form: with code, or without. Two radio
 * rows in plain text — the words carry the difference, not a colour.
 */
export function ProjectProfileField({ value, onChange, disabled }: Props) {
  const name = useId()
  return (
    <fieldset className="min-w-0">
      <legend className="block text-sm font-medium text-gray-300 mb-1">{PROJECT_PROFILE_TEXT.type}</legend>
      <div className="space-y-2">
        {PROJECT_PROFILES.map((profile) => (
          <ChoiceRow
            key={profile}
            name={name}
            value={profile}
            checked={value === profile}
            disabled={disabled}
            onChange={(v) => onChange(v as ProjectProfile)}
            title={PROJECT_PROFILE_TEXT[profile].label}
            description={PROJECT_PROFILE_TEXT[profile].description}
          />
        ))}
      </div>
    </fieldset>
  )
}
