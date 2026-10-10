import type { Translation } from '../../catalog.ts'

export default {
  description: 'خطّط لمراحل التنفيذ وتتبّعها',
  newPlan: 'خطة جديدة',
  searchPlaceholder: 'بحث في الخطط…',
  allStatuses: 'كل الحالات',
  project: 'المشروع',
  listLabel: 'الخطط',
  selectPlan: 'تحديد {title}',
  createdBy: 'أنشأه {name}',
  loaded: 'تم تحميل {loaded} من {total}',
  count: {
    one: 'الخطط: {count}',
    other: 'الخطط: {count}',
  },
  empty: {
    pristineTitle: 'لا توجد خطط بعد',
    pristineBody: 'أنشئ خطة لتنظيم عمل التطوير.',
    filteredTitle: 'لا توجد خطط مطابقة',
    filteredBody: 'جرّب تعديل البحث أو عوامل التصفية.',
  },
  toast: {
    created: 'تم إنشاء الخطة',
    updated: 'تم تحديث الخطة',
    deleted: 'تم حذف الخطة',
    deletedMany: {
      one: 'الخطط المحذوفة: {count}',
      other: 'الخطط المحذوفة: {count}',
    },
  },
  dialog: {
    create: 'إنشاء خطة',
    edit: 'تعديل الخطة',
  },
  confirm: {
    deleteTitle: 'حذف الخطة؟',
    deleteBody: 'سيتم حذف هذه الخطة وكل مهامها نهائيًا.',
    bulkTitle: {
      one: 'حذف الخطط ({count})؟',
      other: 'حذف الخطط ({count})؟',
    },
    bulkBody: {
      one: 'سيتم حذف الخطط المحددة ({count}) وكل مهامها نهائيًا.',
      other: 'سيتم حذف الخطط المحددة ({count}) وكل مهامها نهائيًا.',
    },
  },
} satisfies Translation<'plans'>
