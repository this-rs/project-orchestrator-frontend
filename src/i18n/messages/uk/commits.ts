import type { Translation } from '../../catalog.ts'

export default {
  title: 'Коміти',
  empty: 'Комітів немає',
  copy: 'Копіювати SHA {sha}',
  copied: '{sha} скопійовано',
  files: {
    one: 'Файлів: {count}',
    other: 'Файлів: {count}',
  },
  loadingFiles: 'Завантаження файлів…',
  noFiles: 'Немає даних про файли',
} satisfies Translation<'commits'>
