import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'Сервіс',
    frontend: 'Фронтенд',
    worker: 'Воркер',
    database: 'База даних',
    message_queue: 'Черга',
    cache: 'Кеш',
    gateway: 'Шлюз',
    external: 'Зовнішній',
    library: 'Бібліотека',
    cli: 'CLI',
    other: 'Інше',
  },
  tiers: {
    entry: 'Точки входу',
    gateway: 'Шлюз',
    services: 'Сервіси',
    libraries: 'Бібліотеки, обмін повідомленнями та кеш',
    data: 'Дані та зовнішні системи',
    other: 'Інше',
  },
  legend: {
    required: 'Обов’язковий',
    optional: 'Необов’язковий — система працює й без нього',
    direction: 'Зліва направо: де входять користувачі → сервіси → дані',
    select: 'Виберіть компонент, щоб побачити, що перестане працювати без нього',
  },
  panel: {
    details: 'Відомості: {name}',
    close: 'Закрити відомості',
    optional: 'необов’язковий',
    dependedOnBy: 'Залежать від нього ({n})',
    dependsOn: 'Залежить від ({n})',
    nothingDependsOnThis: 'Від цього ніщо не залежить.',
    dependsOnNothing: 'Ні від чого не залежить.',
    derivedFrom: 'Отримано з {source}',
  },
  description: 'Система в її поточному вигляді: компоненти та залежності між ними.',
  loadFailed: 'Не вдалося завантажити архітектуру',
  emptyTitle: 'Архітектури поки немає',
  emptyDescription:
    'Додайте до робочого простору компоненти (сервіси, бази даних, черги…) або попросіть асистента описати систему.',
  graphLabel: 'Граф архітектури',
  outline: 'Структура архітектури',
} satisfies Translation<'architecture'>
