export default {
  description: 'Plan and track implementation phases',
  newPlan: 'New plan',
  searchPlaceholder: 'Search plans…',
  allStatuses: 'All statuses',
  project: 'Project',
  listLabel: 'Plans',
  selectPlan: 'Select {title}',
  createdBy: 'Created by {name}',
  loaded: '{loaded} of {total} loaded',
  count: { one: '{count} plan', other: '{count} plans' },
  empty: {
    pristineTitle: 'No plans yet',
    pristineBody: 'Create a plan to organize your development work.',
    filteredTitle: 'No matching plans',
    filteredBody: 'Try adjusting your search or filters.',
  },
  toast: {
    created: 'Plan created',
    updated: 'Plan updated',
    deleted: 'Plan deleted',
    deletedMany: { one: 'Deleted {count} plan', other: 'Deleted {count} plans' },
  },
  dialog: {
    create: 'Create plan',
    edit: 'Edit plan',
  },
  confirm: {
    deleteTitle: 'Delete plan?',
    deleteBody: 'This plan and all its tasks will be permanently deleted.',
    bulkTitle: { one: 'Delete {count} plan?', other: 'Delete {count} plans?' },
    bulkBody: {
      one: 'This will permanently delete {count} plan and all its tasks.',
      other: 'This will permanently delete {count} plans and all their tasks.',
    },
  },
} as const
