import { atom } from 'jotai'
import type { Plan, PlanDetails, DependencyGraph, PlanStatus } from '@/types'

export const plansAtom = atom<Plan[]>([])

export const plansLoadingAtom = atom<boolean>(false)

export const selectedPlanIdAtom = atom<string | null>(null)

export const selectedPlanAtom = atom<Plan | null>((get) => {
  const id = get(selectedPlanIdAtom)
  const plans = get(plansAtom)
  return plans.find((p) => p.id === id) ?? null
})

export const planDetailsAtom = atom<PlanDetails | null>(null)

export const planDependencyGraphAtom = atom<DependencyGraph | null>(null)

// Filters
export const planStatusFilterAtom = atom<PlanStatus | 'all'>('all')

export const filteredPlansAtom = atom<Plan[]>((get) => {
  const plans = get(plansAtom)
  const statusFilter = get(planStatusFilterAtom)
  if (statusFilter === 'all') return plans
  return plans.filter((p) => p.status === statusFilter)
})
