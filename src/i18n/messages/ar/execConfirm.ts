import type { Translation } from '../../catalog.ts'

export default {
  aria: 'السماح للمهمة بالعمل في هذا المجلد',
  title: 'التنفيذ في هذا المجلد؟',
  hint: 'لن يبدأ شيء قبل ردّك. أنت وحدك من يستطيع السماح.',
  allow: 'سماح',
  reject: 'رفض',
  state: {
    confirmed: 'تم التأكيد: المهمة تبدأ.',
    rejected: 'تم الرفض: لم يُنفَّذ شيء.',
    expired: 'انتهت الصلاحية: اطلب التفويض مجددًا.',
  },
  error: {
    forbidden: 'يمكن لمالك هذا الطلب وحده الرد عليه.',
    conflict: 'تم الرد على هذا الطلب مسبقًا أو لم يعد مطابقًا.',
    other: 'تعذّر إرسال الرد',
  },
} satisfies Translation<'execConfirm'>
