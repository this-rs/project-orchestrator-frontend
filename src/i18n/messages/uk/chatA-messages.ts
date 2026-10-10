import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "Копіювати як markdown",
    copied: "Скопійовано!",
    popupTitle: "Markdown повідомлення"
  },
  compact: {
    label: "Контекст стиснуто",
    trigger: {
      auto: "авто",
      manual: "вручну"
    },
    tokens: "~{count} тис. токенів"
  },
  continued: {
    label: "Продовжено",
    afterOne: "після ходів: {count}",
    afterMany: "після ходів: {count}"
  },
  bubble: {
    references: "Посилання",
    attachments: "Вкладення",
    copyMessage: "Копіювати повідомлення як markdown",
    copyReply: "Копіювати відповідь як markdown",
    thinking: "Думає..."
  },
  list: {
    loading: "Завантаження повідомлень...",
    loadingOlder: "Завантаження давніших повідомлень...",
    beginning: "— Початок розмови —",
    loadingNewer: "Завантаження новіших повідомлень...",
    scrollMore: "— Прокрутіть униз, щоб побачити більше —",
    catchingUp: "Синхронізація…",
    newActivity: "Нова активність ↓"
  },
  compaction: {
    label: "Стиснення контексту"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "Що ви хочете зробити?",
    quickActions: "Швидкі дії",
    selectProject: "Виберіть проєкт вище, щоб користуватися швидкими діями",
    projectStatus: "Стан проєкту",
    activePlanOne: "Активних планів: {count}",
    activePlanMany: "Активних планів: {count}",
    toReview: "На перевірку: {count}",
    allClear: "Усе гаразд",
    notesOne: "Нотаток: {count}",
    notesMany: "Нотаток: {count}",
    synced: "Синхронізовано {when}",
    untitled: "Без назви",
    untitledConversation: "Розмова без назви",
    recent: "Нещодавні розмови",
    actions: {
      next: {
        label: "Наступне завдання",
        description: "Отримати наступне доступне завдання",
        prompt: "Яке наступне доступне завдання в активному плані? Покажи його контекст і кроки."
      },
      plan: {
        label: "Спланувати щось",
        description: "Спланувати реалізацію",
        prompt: "Сплануй реалізацію: "
      },
      impact: {
        label: "Аналіз впливу",
        description: "Проаналізувати вплив зміни",
        prompt: "Проаналізуй вплив зміни: "
      },
      arch: {
        label: "Архітектура",
        description: "Огляд кодової бази",
        prompt: "Дай мені огляд архітектури проєкту"
      },
      search: {
        label: "Пошук у коді",
        description: "Шукати в кодовій базі",
        prompt: "Знайди в коді: "
      },
      roadmap: {
        label: "Дорожня карта",
        description: "Віхи та релізи",
        prompt: "Покажи повну дорожню карту з віхами та релізами"
      }
    },
    time: {
      now: "щойно",
      minutes: "{count} хв тому",
      hours: "{count} год тому",
      days: "{count} дн. тому",
      months: "{count} міс. тому"
    },
    plan: {
      draft: "Чернетка",
      approved: "Затверджено",
      in_progress: "У роботі",
      completed: "Готово",
      cancelled: "Скасовано"
    }
  },
  panel: {
    connected: "Підключено",
    reconnecting: "Повторне підключення…",
    disconnected: "Відключено",
    connectionLost: "З’єднання втрачено",
    exportTitle: "Експорт чату",
    newChatTitle: "Новий чат",
    chatTitle: "Чат",
    conversations: "Розмови",
    newConversation: "Нова розмова",
    backToChat: "Назад до чату",
    sessions: "Сесії",
    newChat: "Новий чат",
    assistantTree: "Дерево асистентів",
    permissionSettings: "Налаштування дозволів",
    copied: "Скопійовано!",
    copyChat: "Копіювати чат як markdown",
    exitFullscreen: "Вийти з повноекранного режиму",
    close: "Закрити",
    backToParent: "Назад до батьківської",
    actions: "Дії з розмовою",
    attach: "Прив’язати до плану чи завдання…",
    hideTree: "Сховати дерево асистентів",
    showTree: "Показати дерево асистентів",
    fullscreen: "Повний екран",
    noProjectsTitle: "Проєктів ще немає",
    noProjectsBody: "Додайте проєкт до цього робочого простору, щоб почати розмову з Claude.",
    addProject: "Додати проєкт"
  }
} satisfies Translation<'chatA-messages'>
