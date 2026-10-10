import type { Translation } from '../../catalog.ts'

export default {
  description: 'Planifique y haga seguimiento de las fases de implementación',
  newPlan: 'Nuevo plan',
  searchPlaceholder: 'Buscar planes…',
  allStatuses: 'Todos los estados',
  project: 'Proyecto',
  listLabel: 'Planes',
  selectPlan: 'Seleccionar {title}',
  createdBy: 'Creado por {name}',
  loaded: '{loaded} de {total} cargados',
  count: {
    one: '{count} plan',
    other: '{count} planes',
  },
  empty: {
    pristineTitle: 'Aún no hay planes',
    pristineBody: 'Cree un plan para organizar su trabajo de desarrollo.',
    filteredTitle: 'No hay planes coincidentes',
    filteredBody: 'Pruebe a ajustar la búsqueda o los filtros.',
  },
  toast: {
    created: 'Plan creado',
    updated: 'Plan actualizado',
    deleted: 'Plan eliminado',
    deletedMany: {
      one: '{count} plan eliminado',
      other: '{count} planes eliminados',
    },
  },
  dialog: {
    create: 'Crear plan',
    edit: 'Editar plan',
  },
  confirm: {
    deleteTitle: '¿Eliminar el plan?',
    deleteBody: 'Este plan y todas sus tareas se eliminarán de forma permanente.',
    bulkTitle: {
      one: '¿Eliminar {count} plan?',
      other: '¿Eliminar {count} planes?',
    },
    bulkBody: {
      one: 'Se eliminará {count} plan y todas sus tareas de forma permanente.',
      other: 'Se eliminarán {count} planes y todas sus tareas de forma permanente.',
    },
  },
} satisfies Translation<'plans'>
