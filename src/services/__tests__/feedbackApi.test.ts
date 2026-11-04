/**
 * Contrat des routes de retour humain : méthode, chemin et corps de chacune.
 *
 * Ces deux routes existent déjà côté backend (`feedback/handlers.rs`) ; ce fichier dit ce
 * que l'interface en attend, pour qu'un changement de contrat casse ici plutôt qu'en
 * production.
 *
 * Run with: npx vitest run src/services/__tests__/feedbackApi.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const get = vi.fn()
const post = vi.fn()
vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
  },
}))

import { feedbackApi } from '../feedback'

describe('feedbackApi', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('lit les statistiques sur /feedback/stats', async () => {
    get.mockResolvedValue({ stats: [], total_feedback_count: 3, avg_score: 0.5 })
    const response = await feedbackApi.stats()
    expect(get).toHaveBeenCalledWith('/feedback/stats')
    expect(response.total_feedback_count).toBe(3)
  })

  it('passe les filtres dans la chaîne de requête', async () => {
    get.mockResolvedValue({ stats: [], total_feedback_count: 0, avg_score: 0 })
    await feedbackApi.stats({ project_id: 'p1', target_type: 'task' })
    expect(get).toHaveBeenCalledWith('/feedback/stats?project_id=p1&target_type=task')
  })

  it("n'ajoute pas de requête vide quand rien n'est filtré", async () => {
    get.mockResolvedValue({ stats: [], total_feedback_count: 0, avg_score: 0 })
    await feedbackApi.stats({ project_id: undefined })
    expect(get).toHaveBeenCalledWith('/feedback/stats')
  })

  it('poste un verdict de tâche avec son signe, en snake_case', async () => {
    post.mockResolvedValue({ id: 'f1' })
    await feedbackApi.submit({ target_type: 'task', target_id: 't1', score: 1 })
    expect(post).toHaveBeenCalledWith('/feedback', {
      target_type: 'task',
      target_id: 't1',
      score: 1,
    })
  })

  it('transmet un refus avec un score négatif', async () => {
    post.mockResolvedValue({ id: 'f2' })
    await feedbackApi.submit({ target_type: 'task', target_id: 't1', score: -1, comment: 'pas livré' })
    expect(post).toHaveBeenCalledWith('/feedback', {
      target_type: 'task',
      target_id: 't1',
      score: -1,
      comment: 'pas livré',
    })
  })
})
