import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'Только основной', description: 'Один эксклюзивный основной провайдер, как сейчас. PO лишь записывает, что он выбрал бы.' },
    mixed: { label: 'Смешанный', description: 'Основной провайдер ведёт беседу; PO распределяет исполнителей.' },
    full: { label: 'Полный', description: 'PO выбирает всё и объясняет почему.' },
  },
  stages: {
    shadow: { label: 'Теневой', description: 'Ничего не применяется; каждое решение записывается.' },
    advisory: { label: 'Совещательный', description: 'PO предлагает, вы подтверждаете.' },
    auto: { label: 'Автоматический', description: 'PO применяет свои решения.' },
  },
  routedBy: {
    session: 'Выбрано для сеанса',
    request: 'Выбрано в запросе',
    task: 'Выбрано задачей',
    persona: 'Выбрано персоной',
    run: 'Выбрано запуском',
    project_rule: 'Правило проекта',
    global_rule: 'Глобальное правило',
    default: 'Умолчание сервера',
    claude_code: 'Резерв Claude Code',
    fallback: 'Цепочка резервов',
    auto: 'PO выбрал',
  },
  rejection: {
    not_allowed: 'Не разрешён для этого проекта',
    unhealthy: 'Неисправен',
    no_tools: 'Не умеет вызывать инструменты',
    context_too_small: 'Слишком маленькое окно контекста',
    no_images: 'Не читает изображения',
    over_budget: 'Превышен бюджет',
    trust_without_sandbox: 'Режим доверия без песочницы',
    remote: 'Удалённый, здесь не разрешён',
  },
  badge: { poChooses: 'PO выбирает', why: 'Почему?' },
  advanced: { force: 'Расширенно: принудительно выбрать провайдера/модель для этого разговора' },
  picker: { primary: 'Основной: {target} · PO маршрутизирует исполнителей', forced: 'Принудительно: {target}', willChoose: 'PO выберет при первом сообщении', routedBy: 'Маршрутизация: {by}', aria: 'Маршрутизация: {mode}' },
  reason: 'Причина: {reason}',
  settings: { title: 'Маршрутизация', confirmAuto: 'Теперь PO будет применять собственный выбор без вопросов. Продолжить?' },
  report: { agreement: 'Совпадение с реальным выбором', costDelta: 'Оценка разницы в стоимости', unknown: 'Неизвестно' },
} satisfies Translation<'routing'>
