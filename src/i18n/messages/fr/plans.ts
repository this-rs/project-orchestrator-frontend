import type { Translation } from '../../catalog.ts'

export default {
  description: 'Planifiez et suivez les phases d\'implémentation',
  newPlan: 'Nouveau plan',
  searchPlaceholder: 'Rechercher un plan…',
  allStatuses: 'Tous les statuts',
  project: 'Projet',
  listLabel: 'Plans',
  selectPlan: 'Sélectionner {title}',
  createdBy: 'Créé par {name}',
  loaded: '{loaded} sur {total} chargés',
  count: {
    one: '{count} plan',
    other: '{count} plans',
  },
  empty: {
    pristineTitle: 'Aucun plan pour l\'instant',
    pristineBody: 'Créez un plan pour organiser votre travail de développement.',
    filteredTitle: 'Aucun plan correspondant',
    filteredBody: 'Essayez d\'ajuster votre recherche ou vos filtres.',
  },
  toast: {
    created: 'Plan créé',
    updated: 'Plan mis à jour',
    deleted: 'Plan supprimé',
    deletedMany: {
      one: '{count} plan supprimé',
      other: '{count} plans supprimés',
    },
  },
  dialog: {
    create: 'Créer un plan',
    edit: 'Modifier le plan',
  },
  confirm: {
    deleteTitle: 'Supprimer le plan ?',
    deleteBody: 'Ce plan et toutes ses tâches seront définitivement supprimés.',
    bulkTitle: {
      one: 'Supprimer {count} plan ?',
      other: 'Supprimer {count} plans ?',
    },
    bulkBody: {
      one: '{count} plan et toutes ses tâches seront définitivement supprimés.',
      other: '{count} plans et toutes leurs tâches seront définitivement supprimés.',
    },
  },
} satisfies Translation<'plans'>
