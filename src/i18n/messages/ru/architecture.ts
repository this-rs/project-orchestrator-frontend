import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'Сервис',
    frontend: 'Фронтенд',
    worker: 'Воркер',
    database: 'База данных',
    message_queue: 'Очередь',
    cache: 'Кэш',
    gateway: 'Шлюз',
    external: 'Внешний',
    library: 'Библиотека',
    cli: 'CLI',
    other: 'Другое',
  },
  tiers: {
    entry: 'Точки входа',
    gateway: 'Шлюз',
    services: 'Сервисы',
    libraries: 'Библиотеки, обмен сообщениями и кэш',
    data: 'Данные и внешние системы',
    other: 'Другое',
  },
  legend: {
    required: 'Обязательный',
    optional: 'Необязательный — система работает и без него',
    direction: 'Слева направо: где входят пользователи → сервисы → данные',
    select: 'Выберите компонент, чтобы увидеть, что перестанет работать без него',
  },
  panel: {
    details: 'Сведения: {name}',
    close: 'Закрыть сведения',
    optional: 'необязательный',
    dependedOnBy: 'Зависят от него ({n})',
    dependsOn: 'Зависит от ({n})',
    nothingDependsOnThis: 'От этого ничто не зависит.',
    dependsOnNothing: 'Ни от чего не зависит.',
    derivedFrom: 'Получено из {source}',
  },
  description: 'Система в её текущем виде: компоненты и зависимости между ними.',
  loadFailed: 'Не удалось загрузить архитектуру',
  emptyTitle: 'Архитектуры пока нет',
  emptyDescription:
    'Добавьте в рабочее пространство компоненты (сервисы, базы данных, очереди…) или попросите ассистента описать систему.',
  graphLabel: 'Граф архитектуры',
  outline: 'Структура архитектуры',
} satisfies Translation<'architecture'>
