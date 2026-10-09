import { useMemo } from 'react'
import { useT, type MessageKey } from '@/i18n'

const ROLES = [
  'entry_point',
  'core_logic',
  'api_surface',
  'data_model',
  'trait_contract',
  'support',
] as const
const TYPES = ['function', 'file', 'struct', 'trait', 'enum'] as const
const RELATIONS = [
  'CALLS',
  'IMPORTS',
  'EXTENDS',
  'IMPLEMENTS',
  'IMPLEMENTS_TRAIT',
  'IMPLEMENTS_FOR',
] as const

const isRole = (r: string | undefined): r is (typeof ROLES)[number] =>
  !!r && (ROLES as readonly string[]).includes(r)
const isType = (t: string): t is (typeof TYPES)[number] => (TYPES as readonly string[]).includes(t)
const isRelation = (r: string): r is (typeof RELATIONS)[number] =>
  (RELATIONS as readonly string[]).includes(r)

/**
 * The words of the feature-graph model (roles, entity types, importance, relations) in the viewer's
 * language. The wire codes stay English (`entry_point`, `CALLS`…): they are looked up here, and an
 * unknown code reads as itself.
 */
export function useFeatureGraphLabels() {
  const { t } = useT()
  return useMemo(() => {
    const k = (key: string) => t(`featureGraphs.${key}` as MessageKey)
    return {
      roleLabel: (role: string | undefined) =>
        isRole(role) ? k(`roles.${role}.label`) : k('roles.other.label'),
      roleDescription: (role: string | undefined) =>
        isRole(role) ? k(`roles.${role}.description`) : undefined,
      roleWord: (role: string | undefined) =>
        isRole(role) ? k(`roles.${role}.word`) : k('roles.other.word'),
      rolePlain: (role: string | undefined) =>
        isRole(role) ? k(`roles.${role}.plain`) : undefined,
      typeLabel: (type: string) =>
        isType(type)
          ? k(`types.${type}`)
          : type
            ? type.charAt(0).toUpperCase() + type.slice(1)
            : k('types.other'),
      typePlural: (type: string) => (isType(type) ? k(`typePlurals.${type}`) : type),
      importanceLabel: (level: 'key' | 'supporting' | 'minor') => k(`importance.${level}`),
      relationLabel: (type: string) =>
        isRelation(type) ? k(`relations.${type}.label`) : k('help.related'),
      relationDescription: (type: string) =>
        isRelation(type) ? k(`relations.${type}.description`) : undefined,
    }
  }, [t])
}
