import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'الموجات:',
    maxParallel: 'الحد الأقصى للتوازي:',
    criticalPath: 'المسار الحرج:',
    tasks: 'المهام:',
    conflicts: '{count} تعارضات',
    viewRunner: 'عرض Runner',
    resume: 'استئناف الخطة',
    launch: 'إطلاق الخطة',
  },
  card: {
    hideSteps: 'إخفاء خطوات {title}',
    showSteps: 'إظهار خطوات {title}',
    working: 'جارٍ العمل…',
    conflictOn: 'تعارض في: {files}',
    fileConflict: 'تعارض ملفات',
    stepsDone: 'اكتمل {done} من {total} خطوة',
    sharedFile: '{file} — مشترك مع مهمة أخرى في هذه الموجة',
    loadingSteps: 'جارٍ تحميل الخطوات…',
    verify: 'تحقق: {text}',
    noSteps: 'لا توجد خطوات',
    openTask: 'فتح المهمة',
  },
  column: {
    wave: 'الموجة {number}',
    activeWave: 'الموجة النشطة',
    split: 'مقسّمة',
    progress: 'الموجة {number}: اكتمل {done} من {total} مهمة',
  },
  none: 'لم تُحسب أي موجات',
} satisfies Translation<'waves'>
