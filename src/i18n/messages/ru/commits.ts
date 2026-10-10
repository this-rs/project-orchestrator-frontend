import type { Translation } from '../../catalog.ts'

export default {
  title: 'Коммиты',
  empty: 'Коммитов нет',
  copy: 'Копировать SHA {sha}',
  copied: '{sha} скопирован',
  files: {
    one: 'Файлов: {count}',
    other: 'Файлов: {count}',
  },
  loadingFiles: 'Загрузка файлов…',
  noFiles: 'Нет данных о файлах',
} satisfies Translation<'commits'>
