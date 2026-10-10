import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "نسخ بصيغة Markdown",
    copied: "تم النسخ!",
    popupTitle: "Markdown الرسالة"
  },
  compact: {
    label: "تم ضغط السياق",
    trigger: {
      auto: "تلقائي",
      manual: "يدوي"
    },
    tokens: "~{count} ألف رمز"
  },
  continued: {
    label: "تمت المتابعة",
    afterOne: "بعد {count} دور",
    afterMany: "بعد {count} أدوار"
  },
  bubble: {
    references: "المراجع",
    attachments: "المرفقات",
    copyMessage: "نسخ الرسالة بصيغة Markdown",
    copyReply: "نسخ الرد بصيغة Markdown",
    thinking: "يفكّر..."
  },
  list: {
    loading: "جارٍ تحميل الرسائل...",
    loadingOlder: "جارٍ تحميل الرسائل الأقدم...",
    beginning: "— بداية المحادثة —",
    loadingNewer: "جارٍ تحميل الرسائل الأحدث...",
    scrollMore: "— مرّر للأسفل لعرض المزيد —",
    catchingUp: "جارٍ اللحاق…",
    newActivity: "نشاط جديد ↓"
  },
  compaction: {
    label: "جارٍ ضغط السياق"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "ماذا تريد أن تفعل؟",
    quickActions: "إجراءات سريعة",
    selectProject: "اختر مشروعًا أعلاه لاستخدام الإجراءات السريعة",
    projectStatus: "حالة المشروع",
    activePlanOne: "{count} خطة نشطة",
    activePlanMany: "{count} خطط نشطة",
    toReview: "{count} للمراجعة",
    allClear: "كل شيء على ما يرام",
    notesOne: "{count} ملاحظة",
    notesMany: "{count} ملاحظات",
    synced: "تمت المزامنة {when}",
    untitled: "بلا عنوان",
    untitledConversation: "محادثة بلا عنوان",
    recent: "المحادثات الأخيرة",
    actions: {
      next: {
        label: "المهمة التالية",
        description: "الحصول على المهمة التالية المتاحة",
        prompt: "ما هي المهمة التالية المتاحة في الخطة النشطة؟ أرني سياقها وخطواتها."
      },
      plan: {
        label: "خطّط لشيء ما",
        description: "خطّط لتنفيذ",
        prompt: "خطّط لتنفيذ: "
      },
      impact: {
        label: "تحليل الأثر",
        description: "تحليل أثر تغيير",
        prompt: "حلّل أثر تغيير: "
      },
      arch: {
        label: "البنية",
        description: "نظرة عامة على الشيفرة",
        prompt: "أعطني نظرة عامة على بنية المشروع"
      },
      search: {
        label: "بحث في الشيفرة",
        description: "البحث في الشيفرة المصدرية",
        prompt: "ابحث في الشيفرة عن: "
      },
      roadmap: {
        label: "خارطة الطريق",
        description: "المعالم والإصدارات",
        prompt: "أرني خارطة الطريق الكاملة مع المعالم والإصدارات"
      }
    },
    time: {
      now: "الآن",
      minutes: "قبل {count} د",
      hours: "قبل {count} س",
      days: "قبل {count} ي",
      months: "قبل {count} ش"
    },
    plan: {
      draft: "مسودة",
      approved: "معتمدة",
      in_progress: "قيد التنفيذ",
      completed: "منجزة",
      cancelled: "ملغاة"
    }
  },
  panel: {
    connected: "متصل",
    reconnecting: "جارٍ إعادة الاتصال…",
    disconnected: "غير متصل",
    connectionLost: "انقطع الاتصال",
    exportTitle: "تصدير المحادثة",
    newChatTitle: "محادثة جديدة",
    chatTitle: "محادثة",
    conversations: "المحادثات",
    newConversation: "محادثة جديدة",
    backToChat: "العودة إلى المحادثة",
    sessions: "الجلسات",
    newChat: "محادثة جديدة",
    assistantTree: "شجرة المساعدين",
    permissionSettings: "إعدادات الأذونات",
    copied: "تم النسخ!",
    copyChat: "نسخ المحادثة بصيغة Markdown",
    exitFullscreen: "الخروج من ملء الشاشة",
    close: "إغلاق",
    backToParent: "العودة إلى الأصل",
    actions: "إجراءات المحادثة",
    attach: "ربط بخطة أو مهمة…",
    hideTree: "إخفاء شجرة المساعدين",
    showTree: "إظهار شجرة المساعدين",
    fullscreen: "ملء الشاشة",
    noProjectsTitle: "لا توجد مشاريع بعد",
    noProjectsBody: "أضف مشروعًا إلى مساحة العمل هذه لبدء محادثة مع Claude.",
    addProject: "إضافة مشروع"
  }
} satisfies Translation<'chatA-messages'>
