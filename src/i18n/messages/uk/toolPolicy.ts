import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: 'Автосхвалення правок',
    ask: 'Питати',
    plan_only: 'Лише план',
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: 'Приймати правки',
    ask: 'Типовий',
    plan_only: 'Лише план',
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: 'Приймати правки',
    ask: 'Питати дозволи',
    plan_only: 'Режим плану',
  },
  native: {
    auto: { short: 'Авто', long: 'Автоматичний режим' },
    dontAsk: { short: 'Не питати', long: 'Не питати' },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: 'Автоматично схвалювати всі інструменти. Без запитів.' },
      auto_edits: { label: 'Приймати правки', description: 'Автоматично схвалювати правки файлів, для команд запитувати.' },
      ask: { label: 'Типовий', description: 'Запитувати для кожного використання інструментів.' },
      plan_only: { label: 'Лише план', description: 'Режим лише для читання. Без запису й команд.' },
    },
    neutral: {
      trust: { description: 'Виконувати кожен інструмент без запиту.' },
      auto_edits: { description: 'Правки файлів виконуються без запиту; команди все одно запитують.' },
      ask: { description: 'Запитувати перед кожним викликом інструмента.' },
      plan_only: { description: 'Лише читання. Без запису й команд.' },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: 'Усі інструменти схвалюються автоматично — без запитів на дозвіл',
      summary: "Rock'n roll (усе схвалюється автоматично)",
    },
    ask: {
      label: 'Типовий',
      description: 'Запитує схвалення для правок файлів і команд оболонки',
      summary: 'Типовий (питати про правки й оболонку)',
    },
    auto_edits: {
      label: 'Приймати правки',
      description: 'Правки файлів схвалюються автоматично, команди оболонки потребують схвалення',
      summary: 'Приймати правки (питати лише про оболонку)',
    },
    plan_only: {
      label: 'Лише план',
      description: 'Режим лише для читання — Claude може читати, але не змінювати файли',
      summary: 'Лише план (лише читання)',
    },
  },
  trustRequiresSandbox: 'Недоступно: цей віддалений комп\'ютер не дозволяє такий режим. Увімкніть його в налаштуваннях екземпляра, щоб виконувати інструменти без підтвердження.',
  rulesUnsupported: 'Правила дозволу й заборони специфічні для Claude Code. Цей провайдер їх не застосовує, тому вони не показані: інструментами керує режим дозволів вище.',
  trustDowngraded: 'Режим «Rock’n roll» замінено на «Питати»: цей віддалений комп\'ютер його не дозволяє.',
} satisfies Translation<'toolPolicy'>
