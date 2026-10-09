import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "Копировать как markdown",
    copied: "Скопировано!",
    popupTitle: "Markdown сообщения"
  },
  compact: {
    label: "Контекст сжат",
    trigger: {
      auto: "авто",
      manual: "вручную"
    },
    tokens: "~{count} тыс. токенов"
  },
  continued: {
    label: "Продолжено",
    afterOne: "после ходов: {count}",
    afterMany: "после ходов: {count}"
  },
  bubble: {
    references: "Ссылки",
    attachments: "Вложения",
    copyMessage: "Копировать сообщение как markdown",
    copyReply: "Копировать ответ как markdown",
    thinking: "Думает..."
  },
  list: {
    loading: "Загрузка сообщений...",
    loadingOlder: "Загрузка более ранних сообщений...",
    beginning: "— Начало беседы —",
    loadingNewer: "Загрузка более новых сообщений...",
    scrollMore: "— Прокрутите вниз, чтобы увидеть больше —",
    catchingUp: "Синхронизация…",
    newActivity: "Новая активность ↓"
  },
  compaction: {
    label: "Сжатие контекста"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "Что вы хотите сделать?",
    quickActions: "Быстрые действия",
    selectProject: "Выберите проект выше, чтобы использовать быстрые действия",
    projectStatus: "Состояние проекта",
    activePlanOne: "Активных планов: {count}",
    activePlanMany: "Активных планов: {count}",
    toReview: "На проверку: {count}",
    allClear: "Всё в порядке",
    notesOne: "Заметок: {count}",
    notesMany: "Заметок: {count}",
    synced: "Синхронизировано {when}",
    untitled: "Без названия",
    untitledConversation: "Беседа без названия",
    recent: "Недавние беседы",
    actions: {
      next: {
        label: "Следующая задача",
        description: "Получить следующую доступную задачу",
        prompt: "Какая следующая доступная задача в активном плане? Покажи её контекст и шаги."
      },
      plan: {
        label: "Спланировать что-нибудь",
        description: "Спланировать реализацию",
        prompt: "Спланируй реализацию: "
      },
      impact: {
        label: "Анализ влияния",
        description: "Проанализировать влияние изменения",
        prompt: "Проанализируй влияние изменения: "
      },
      arch: {
        label: "Архитектура",
        description: "Обзор кодовой базы",
        prompt: "Дай мне обзор архитектуры проекта"
      },
      search: {
        label: "Поиск по коду",
        description: "Искать в кодовой базе",
        prompt: "Найди в коде: "
      },
      roadmap: {
        label: "Дорожная карта",
        description: "Вехи и релизы",
        prompt: "Покажи полную дорожную карту с вехами и релизами"
      }
    },
    time: {
      now: "только что",
      minutes: "{count} мин назад",
      hours: "{count} ч назад",
      days: "{count} дн. назад",
      months: "{count} мес. назад"
    },
    plan: {
      draft: "Черновик",
      approved: "Утверждён",
      in_progress: "В работе",
      completed: "Готово",
      cancelled: "Отменён"
    }
  },
  panel: {
    connected: "Подключено",
    reconnecting: "Переподключение…",
    disconnected: "Отключено",
    connectionLost: "Соединение потеряно",
    exportTitle: "Экспорт чата",
    newChatTitle: "Новый чат",
    chatTitle: "Чат",
    conversations: "Беседы",
    newConversation: "Новая беседа",
    backToChat: "Назад к чату",
    sessions: "Сессии",
    newChat: "Новый чат",
    assistantTree: "Дерево ассистентов",
    permissionSettings: "Настройки разрешений",
    copied: "Скопировано!",
    copyChat: "Копировать чат как markdown",
    exitFullscreen: "Выйти из полноэкранного режима",
    close: "Закрыть",
    backToParent: "Назад к родительской",
    actions: "Действия с беседой",
    attach: "Привязать к плану или задаче…",
    hideTree: "Скрыть дерево ассистентов",
    showTree: "Показать дерево ассистентов",
    fullscreen: "Полный экран",
    noProjectsTitle: "Проектов пока нет",
    noProjectsBody: "Добавьте проект в это рабочее пространство, чтобы начать беседу с Claude.",
    addProject: "Добавить проект"
  }
} satisfies Translation<'chatA-messages'>
