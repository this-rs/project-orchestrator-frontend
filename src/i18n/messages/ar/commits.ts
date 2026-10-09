import type { Translation } from '../../catalog.ts'

export default {
  title: 'Commits',
  empty: 'لا توجد commits',
  copy: 'نسخ SHA {sha}',
  copied: 'تم نسخ {sha}',
  files: {
    one: 'الملفات: {count}',
    other: 'الملفات: {count}',
  },
  loadingFiles: 'جارٍ تحميل الملفات…',
  noFiles: 'لا تتوفر تفاصيل للملفات',
} satisfies Translation<'commits'>
