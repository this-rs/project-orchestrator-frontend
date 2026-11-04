import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const submit = vi.fn()
vi.mock('@/services/feedback', () => ({
  feedbackApi: { submit: (...a: unknown[]) => submit(...a) },
}))

import { TaskVerdict } from './TaskVerdict'

beforeEach(() => submit.mockReset())

describe('TaskVerdict', () => {
  it('enregistre un verdict positif pour la tâche', async () => {
    submit.mockResolvedValue({ id: 'f1' })
    render(<TaskVerdict taskId="t1" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delivered' }))
    })

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith({
      target_type: 'task',
      target_id: 't1',
      score: 1,
    })
  })

  it('enregistre un refus avec un score négatif et porte le projet', async () => {
    submit.mockResolvedValue({ id: 'f2' })
    render(<TaskVerdict taskId="t1" projectId="p1" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Not delivered' }))
    })

    expect(submit).toHaveBeenCalledWith({
      target_type: 'task',
      target_id: 't1',
      score: -1,
      project_id: 'p1',
    })
  })

  // NON COUVERT, et c'est écrit exprès : le chemin d'ÉCHEC (le verdict n'est pas
  // enregistré → `role="alert"`). Toute tentative de le tester ici — `mockRejectedValue`,
  // `mockImplementation(() => { throw })`, `Promise.reject().catch()` — fait échouer le
  // test sur « Error: boom » AVANT l'assertion : ce harnais traite un rejet venu d'un
  // service moqué comme une erreur de test, quoi qu'il en soit fait. Le comportement est
  // correct dans le composant (try/catch → setError → role="alert") mais il n'est PAS
  // prouvé par un test. À couvrir le jour où le harnais le permettra, pas avant de dire
  // que c'est fait.
})
