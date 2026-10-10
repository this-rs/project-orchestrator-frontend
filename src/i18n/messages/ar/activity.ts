import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: 'قيد التنفيذ',
    queued: 'في الانتظار',
    done: 'اكتمل',
    failed: 'فشل',
    cancelled: 'أُلغي',
    ended: 'انتهى',
  },
  lifecycle: {
    started: 'بدأ',
    progress: 'التقدّم',
    updated: 'تم التحديث',
    finished: 'انتهى',
  },
  param: {
    agent: 'الوكيل',
    workflow: 'سير العمل',
    task: 'المهمة',
    tool: 'الأداة',
    model: 'النموذج',
    exitCode: 'رمز الخروج',
    taskId: 'معرّف المهمة',
    outputFile: 'ملف المخرجات',
  },
  title: {
    workflow: 'سير العمل',
    shell: 'أمر في الخلفية',
    monitor: 'المراقب',
    agent: 'وكيل فرعي',
  },
} satisfies Translation<'activity'>
