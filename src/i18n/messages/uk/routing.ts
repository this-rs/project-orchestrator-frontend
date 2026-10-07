import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'Лише основний', description: 'Один ексклюзивний основний провайдер, як зараз. PO лише записує, що він обрав би.' },
    mixed: { label: 'Змішаний', description: 'Основний провайдер веде розмову; PO розподіляє виконавців.' },
    full: { label: 'Повний', description: 'PO обирає все й пояснює чому.' },
  },
  stages: {
    shadow: { label: 'Тіньовий', description: 'Нічого не застосовується; кожне рішення записується.' },
    advisory: { label: 'Дорадчий', description: 'PO пропонує, ви підтверджуєте.' },
    auto: { label: 'Автоматичний', description: 'PO застосовує свої рішення.' },
  },
  routedBy: {
    session: 'Обрано для сеансу',
    request: 'Обрано в запиті',
    task: 'Обрано завданням',
    persona: 'Обрано персоною',
    run: 'Обрано запуском',
    project_rule: 'Правило проєкту',
    global_rule: 'Глобальне правило',
    default: 'Типове значення сервера',
    claude_code: 'Резерв Claude Code',
    fallback: 'Ланцюжок резервів',
    auto: 'PO обрав',
  },
  rejection: {
    not_allowed: 'Не дозволено для цього проєкту',
    unhealthy: 'Несправний',
    no_tools: 'Не вміє викликати інструменти',
    context_too_small: 'Занадто мале вікно контексту',
    no_images: 'Не читає зображення',
    over_budget: 'Перевищено бюджет',
    trust_without_sandbox: 'Режим довіри без пісочниці',
    remote: 'Віддалений, тут не дозволений',
  },
  badge: { poChooses: 'PO обирає', why: 'Чому?' },
  advanced: { force: 'Додатково: примусово обрати провайдера/модель для цієї розмови' },
  picker: { primary: 'Основний: {target} · PO маршрутизує виконавців', forced: 'Примусово: {target}', willChoose: 'PO обере при першому повідомленні', routedBy: 'Маршрутизація: {by}', aria: 'Маршрутизація: {mode}' },
  reason: 'Причина: {reason}',
  settings: { title: 'Маршрутизація', confirmAuto: 'Відтепер PO застосовуватиме власний вибір без запитань. Продовжити?' },
  report: { agreement: 'Збіг із реальним вибором', costDelta: 'Оцінка різниці у вартості', unknown: 'Невідомо' },
} satisfies Translation<'routing'>
