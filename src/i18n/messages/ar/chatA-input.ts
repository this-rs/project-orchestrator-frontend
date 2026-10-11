import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "تمت الإجابة:",
    placeholder: "أو اكتب إجابتك...",
    submit: "إرسال",
    notSent: "لم يُرسل: انقطع الاتصال. إجابتك محفوظة، حاول مرة أخرى بعد إعادة الاتصال."
  },
  attachments: {
    processing: "جارٍ المعالجة…",
    remove: "إزالة",
    removeAria: "إزالة {name}",
    pendingSend: "سيتم إرسال الرسالة عند انتهاء الرفع"
  },
  upload: {
    network: "خطأ في الشبكة — لم يصل الملف إلى الخادم",
    timeout: "لم يستجب الخادم في الوقت المناسب — أزل الملف وأضفه من جديد",
    tooLarge: "الملف كبير جدًا",
    unsupported: "تنسيق الملف غير مدعوم",
    unreadable: "تعذّرت قراءة الملف (تالف أو غير صالح)",
    forbidden: "غير مسموح بالرفع هنا",
    failed: "فشل الرفع (HTTP {status})"
  },
  action: {
    send: "إرسال الرسالة",
    stop: "إيقاف التوليد",
    stopping: "جارٍ الإيقاف…",
    waiting: "بانتظار انتهاء رفع المرفقات",
    idle: "إرسال الرسالة",
    removeFailed: "أزل المرفق الفاشل أولًا",
    waitingUpload: "بانتظار انتهاء الرفع"
  },
  composer: {
    imageName: "صورة",
    alreadyIn: "{label} موجود بالفعل في الرسالة.",
    added: "تمت إضافة {label} إلى الرسالة.",
    close: "إغلاق",
    maxRefs: "الحد الأقصى {max} مراجع لكل رسالة: لم تتم إضافة المرجع الأخير.",
    references: "المراجع",
    placeholder: "أرسل رسالة...",
    attach: "إرفاق ملف",
    override: "(تجاوز)",
    default: "افتراضي",
    auto: "تلقائي",
    autoOn: "تم تفعيل المتابعة التلقائية",
    autoOff: "تم تعطيل المتابعة التلقائية",
    drop: "أفلت للإرفاق"
  },
  refs: {
    picker: {
      all: "الكل",
      filterByKind: "تصفية حسب النوع",
      hintActors: "الجهات",
      hintSearch: "بحث",
      kindOnly: "{kind} فقط",
      resultsOne: "نتيجة واحدة ({count})",
      resultsMany: "{count} نتائج",
      noResults: "لا توجد نتائج",
      searching: "جارٍ البحث…",
      noActors: "لا توجد جهات متاحة على هذا الخادم",
      needsProject: "اختر مشروعًا للبحث عن الشخصيات والمهارات",
      close: "إغلاق المراجع"
    }
  }
} satisfies Translation<'chatA-input'>
