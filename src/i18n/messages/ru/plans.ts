import type { Translation } from '../../catalog.ts'

export default {
  description: 'Планируйте и отслеживайте этапы реализации',
  newPlan: 'Новый план',
  searchPlaceholder: 'Поиск плана…',
  allStatuses: 'Все статусы',
  project: 'Проект',
  listLabel: 'Планы',
  selectPlan: 'Выбрать {title}',
  createdBy: 'Автор: {name}',
  loaded: 'Загружено: {loaded} из {total}',
  count: {
    one: 'Планов: {count}',
    other: 'Планов: {count}',
  },
  empty: {
    pristineTitle: 'Планов пока нет',
    pristineBody: 'Создайте план, чтобы организовать свою работу по разработке.',
    filteredTitle: 'Подходящих планов нет',
    filteredBody: 'Попробуйте изменить поиск или фильтры.',
  },
  toast: {
    created: 'План создан',
    updated: 'План обновлён',
    deleted: 'План удалён',
    deletedMany: {
      one: 'Удалено планов: {count}',
      other: 'Удалено планов: {count}',
    },
  },
  dialog: {
    create: 'Создать план',
    edit: 'Изменить план',
  },
  confirm: {
    deleteTitle: 'Удалить план?',
    deleteBody: 'Этот план и все его задачи будут удалены безвозвратно.',
    bulkTitle: {
      one: 'Удалить планы ({count})?',
      other: 'Удалить планы ({count})?',
    },
    bulkBody: {
      one: 'Планы и все их задачи будут удалены безвозвратно (количество планов: {count}).',
      other: 'Планы и все их задачи будут удалены безвозвратно (количество планов: {count}).',
    },
  },
} satisfies Translation<'plans'>
