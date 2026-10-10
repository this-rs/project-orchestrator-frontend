import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: 'Выполняется',
    queued: 'В очереди',
    done: 'Готово',
    failed: 'Сбой',
    cancelled: 'Отменено',
    ended: 'Завершено',
  },
  lifecycle: {
    started: 'Запущено',
    progress: 'Ход выполнения',
    updated: 'Обновлено',
    finished: 'Завершено',
  },
  param: {
    agent: 'Агент',
    workflow: 'Рабочий процесс',
    task: 'Задача',
    tool: 'Инструмент',
    model: 'Модель',
    exitCode: 'Код выхода',
    taskId: 'ID задачи',
    outputFile: 'Файл вывода',
  },
  title: {
    workflow: 'Рабочий процесс',
    shell: 'Фоновая команда',
    monitor: 'Монитор',
    agent: 'Подагент',
  },
} satisfies Translation<'activity'>
