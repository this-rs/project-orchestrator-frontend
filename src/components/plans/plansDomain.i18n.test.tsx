import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { CommitList } from '@/components/commits'
import { PipelineTreeView } from '@/components/pipeline/PipelineTreeView'
import { WaveView } from './WaveView'
import type { WaveComputationResult } from '@/types'

const noWaves = { waves: [], conflicts: [], summary: {} } as unknown as WaveComputationResult

describe('plans domain: components follow the interface language', () => {
  it('commits and pipeline read in English without a provider', () => {
    render(<CommitList commits={[]} />)
    expect(screen.getByText('No commits')).toBeTruthy()
    render(<PipelineTreeView nodes={[]} progress={null} gates={[]} />)
    expect(screen.getByText('No pipeline execution data yet.')).toBeTruthy()
  })

  it('renders French once the language is loaded', async () => {
    render(
      <I18nProvider initial="fr">
        <MemoryRouter>
          <CommitList commits={[]} />
          <PipelineTreeView nodes={[]} progress={null} gates={[]} />
          <WaveView data={noWaves} />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(await screen.findByText('Aucun commit')).toBeTruthy()
    expect(screen.getByText("Aucune donnée d'exécution du pipeline pour l'instant.")).toBeTruthy()
    expect(screen.getByText('Aucune vague calculée')).toBeTruthy()
  })

  it('renders Arabic with its own wording', async () => {
    render(
      <I18nProvider initial="ar">
        <CommitList commits={[]} />
      </I18nProvider>,
    )
    expect(await screen.findByText(/^(?!No commits).+/)).toBeTruthy()
    expect(screen.queryByText('No commits')).toBeNull()
  })
})
