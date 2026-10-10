import type { Translation } from '../../catalog.ts'

export default {
  bash: {
    emptyCommand: "(порожня команда)",
    showLess: "показати менше",
    showMore: "показати ще символів: {count}",
    noOutput: "немає виводу",
    running: "виконується..."
  },
  default: {
    input: "Вхід",
    error: "Помилка",
    result: "Результат",
    truncated: "... (обрізано)"
  },
  edit: {
    replaceAll: "замінити все",
    removedLineOne: "−{count} рядків",
    removedLineMany: "−{count} рядків",
    addedLineOne: "+{count} рядків",
    addedLineMany: "+{count} рядків",
    moreRemovedOne: "... ще видалених рядків: {count}",
    moreRemovedMany: "... ще видалених рядків: {count}",
    moreAddedOne: "... ще доданих рядків: {count}",
    moreAddedMany: "... ще доданих рядків: {count}",
    truncated: "... (обрізано)",
    editing: "редагування..."
  },
  chat: {
    you: "Ви",
    assistant: "Асистент",
    messageOne: "Повідомлень: {count}",
    messageMany: "Повідомлень: {count}"
  },
  code: {
    copyPath: "Копіювати шлях",
    noResults: "Немає результатів",
    searchResults: "Результати пошуку",
    noSymbols: "Символи не знайдено",
    noReferences: "Посилання не знайдено",
    unknownFile: "(невідомо)",
    references: "Посилання",
    calledBy: "Викликається з",
    calls: "Викликає",
    noCallGraph: "Немає даних графа викликів",
    callersColon: "викликачі:",
    dependentFiles: "Залежні файли",
    mostConnected: "Найбільш пов’язані файли",
    imports: "Імпорти",
    importedBy: "Імпортується в",
    label: {
      results: "результати",
      files: "файли",
      callers: "викликачі",
      callees: "викликані",
      imports: "імпорти",
      dependents: "залежні"
    },
    cat: {
      functions: "функції",
      structs: "структури",
      enums: "переліки",
      traits: "трейти",
      impls: "impl",
      macros: "макроси",
      constants: "константи",
      type_aliases: "псевдоніми типів"
    },
    symbols: {
      implementations: "Реалізації",
      traits: "Трейти",
      impls: "Блоки impl"
    },
    symbolsNone: {
      implementations: "Реалізацій не знайдено",
      traits: "Трейтів не знайдено",
      impls: "Блоків impl не знайдено"
    }
  },
  entity: {
    project: "проєкт",
    created: "створено",
    plan: "план",
    path: "шлях",
    synced: "синхронізовано",
    target: "ціль",
    verify: "перевірка",
    tasks: "Завдання",
    constraints: "Обмеження",
    criteria: "Критерії приймання",
    steps: "Кроки",
    decisions: "Рішення",
    label: {
      tasks: "завдання",
      constraints: "обмеження",
      criteria: "критерії",
      steps: "кроки",
      decisions: "рішення"
    },
    type: {
      plan: "план",
      task: "завдання",
      project: "проєкт",
      milestone: "віха",
      workspace: "робочий простір",
      note: "нотатка",
      release: "реліз"
    },
    view: {
      entity: "Відкрити: {entity}",
      parentTask: "Відкрити батьківське завдання",
      parentPlan: "Відкрити батьківський план",
      linkedTask: "Відкрити пов’язане завдання",
      linkedPlan: "Відкрити пов’язаний план"
    },
    deleted: "Видалено",
    updated: "Оновлено",
    createdVerb: "Створено",
    moreFields: "+ ще полів: {count}"
  },
  list: {
    untitledPlan: "План без назви",
    untitledSession: "Сесія без назви",
    msgOne: "Повід.: {count}",
    msgMany: "Повід.: {count}",
    energy: "Рівень енергії",
    target: "ціль: {date}",
    noResults: "Немає результатів",
    resultOne: "Результатів: {count}",
    resultMany: "Результатів: {count}",
    matching: "за запитом «{query}»"
  },
  viz: {
    noRadar: "Дані радара недоступні.",
    unknownTarget: "невідомо",
    direct: "Прямі ({count})",
    transitive: "Транзитивні ({count})",
    total: "усього {count}",
    importance: {
      critical: "КРИТИЧНО",
      high: "ВИСОКА",
      medium: "СЕРЕДНЯ",
      low: "НИЗЬКА"
    },
    kind: {
      guideline: "настанова",
      gotcha: "підступ",
      pattern: "патерн",
      context: "контекст",
      tip: "порада",
      observation: "спостереження",
      assertion: "твердження",
      decision: "рішення"
    }
  },
  permission: {
    actions: "Відповісти на цей запит дозволу",
    allowOnce: "Дозволити один раз",
    allowSession: "На цей сеанс",
    deny: "Заборонити",
    sessionHint: "Більше не питати в цій розмові для цього ж виклику",
    awaiting: "Очікування підтвердження…",
    sessionCovers: "«На цей сеанс» стосується лише:",
    unconfirmed: "Підтвердження не отримано. Дайте відповідь ще раз.",
    scopeRefused: "Цей дозвіл не можна зберегти на сеанс (виклик запускає іншу команду, або сеанс цього не пропонує). Дозвольте один раз або забороніть.",
    allowed: "Дозволено",
    allowedSession: "Дозволено на сеанс",
    denied: "Заборонено"
  }
} satisfies Translation<'chatA-tools'>
