import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'Волны:',
    maxParallel: 'Макс. параллелизм:',
    criticalPath: 'Критический путь:',
    tasks: 'Задачи:',
    conflicts: 'Конфликтов: {count}',
    viewRunner: 'Открыть runner',
    resume: 'Возобновить план',
    launch: 'Запустить план',
  },
  card: {
    hideSteps: 'Скрыть шаги: {title}',
    showSteps: 'Показать шаги: {title}',
    working: 'Выполняется…',
    conflictOn: 'Конфликт в: {files}',
    fileConflict: 'Конфликт файлов',
    stepsDone: 'Завершено шагов: {done} из {total}',
    sharedFile: '{file} — общий с другой задачей этой волны',
    loadingSteps: 'Загрузка шагов…',
    verify: 'Проверка: {text}',
    noSteps: 'Нет шагов',
    openTask: 'Открыть задачу',
  },
  column: {
    wave: 'Волна {number}',
    activeWave: 'Активная волна',
    split: 'разделена',
    progress: 'Волна {number}: завершено задач {done} из {total}',
  },
  none: 'Волны не рассчитаны',
} satisfies Translation<'waves'>
