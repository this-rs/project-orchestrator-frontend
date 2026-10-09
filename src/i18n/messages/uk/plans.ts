import type { Translation } from '../../catalog.ts'

export default {
  description: 'Плануйте та відстежуйте етапи реалізації',
  newPlan: 'Новий план',
  searchPlaceholder: 'Пошук плану…',
  allStatuses: 'Усі статуси',
  project: 'Проєкт',
  listLabel: 'Плани',
  selectPlan: 'Вибрати {title}',
  createdBy: 'Автор: {name}',
  loaded: 'Завантажено: {loaded} з {total}',
  count: {
    one: 'Планів: {count}',
    other: 'Планів: {count}',
  },
  empty: {
    pristineTitle: 'Планів поки немає',
    pristineBody: 'Створіть план, щоб організувати свою роботу з розробки.',
    filteredTitle: 'Відповідних планів немає',
    filteredBody: 'Спробуйте змінити пошук або фільтри.',
  },
  toast: {
    created: 'План створено',
    updated: 'План оновлено',
    deleted: 'План видалено',
    deletedMany: {
      one: 'Видалено планів: {count}',
      other: 'Видалено планів: {count}',
    },
  },
  dialog: {
    create: 'Створити план',
    edit: 'Змінити план',
  },
  confirm: {
    deleteTitle: 'Видалити план?',
    deleteBody: 'Цей план і всі його завдання буде видалено безповоротно.',
    bulkTitle: {
      one: 'Видалити плани ({count})?',
      other: 'Видалити плани ({count})?',
    },
    bulkBody: {
      one: 'Плани та всі їхні завдання буде видалено безповоротно (кількість планів: {count}).',
      other: 'Плани та всі їхні завдання буде видалено безповоротно (кількість планів: {count}).',
    },
  },
} satisfies Translation<'plans'>
