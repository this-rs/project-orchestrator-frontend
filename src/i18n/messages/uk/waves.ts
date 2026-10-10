import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'Хвилі:',
    maxParallel: 'Макс. паралелізм:',
    criticalPath: 'Критичний шлях:',
    tasks: 'Завдання:',
    conflicts: 'Конфліктів: {count}',
    viewRunner: 'Відкрити runner',
    resume: 'Відновити план',
    launch: 'Запустити план',
  },
  card: {
    hideSteps: 'Сховати кроки: {title}',
    showSteps: 'Показати кроки: {title}',
    working: 'Виконується…',
    conflictOn: 'Конфлікт у: {files}',
    fileConflict: 'Конфлікт файлів',
    stepsDone: 'Завершено кроків: {done} з {total}',
    sharedFile: '{file} — спільний з іншим завданням цієї хвилі',
    loadingSteps: 'Завантаження кроків…',
    verify: 'Перевірка: {text}',
    noSteps: 'Немає кроків',
    openTask: 'Відкрити завдання',
  },
  column: {
    wave: 'Хвиля {number}',
    activeWave: 'Активна хвиля',
    split: 'розділено',
    progress: 'Хвиля {number}: завершено завдань {done} з {total}',
  },
  none: 'Хвилі не розраховано',
} satisfies Translation<'waves'>
