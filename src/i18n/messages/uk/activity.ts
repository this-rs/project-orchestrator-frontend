import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: 'Виконується',
    queued: 'У черзі',
    done: 'Готово',
    failed: 'Помилка',
    cancelled: 'Скасовано',
    ended: 'Завершено',
  },
  lifecycle: {
    started: 'Розпочато',
    progress: 'Хід виконання',
    updated: 'Оновлено',
    finished: 'Завершено',
  },
  param: {
    agent: 'Агент',
    workflow: 'Робочий процес',
    task: 'Завдання',
    tool: 'Інструмент',
    model: 'Модель',
    exitCode: 'Код завершення',
    taskId: 'ID завдання',
    outputFile: 'Файл виводу',
  },
  title: {
    workflow: 'Робочий процес',
    shell: 'Фонова команда',
    monitor: 'Монітор',
    agent: 'Підагент',
  },
} satisfies Translation<'activity'>
