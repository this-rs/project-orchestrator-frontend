import type { Translation } from '../../catalog.ts'

export default {
  bash: {
    emptyCommand: "(أمر فارغ)",
    showLess: "عرض أقل",
    showMore: "عرض {count} أحرف إضافية",
    noOutput: "لا توجد مخرجات",
    running: "قيد التشغيل..."
  },
  default: {
    input: "المدخلات",
    error: "خطأ",
    result: "النتيجة",
    truncated: "... (تم الاقتطاع)"
  },
  edit: {
    replaceAll: "استبدال الكل",
    removedLineOne: "-{count} سطر",
    removedLineMany: "-{count} أسطر",
    addedLineOne: "+{count} سطر",
    addedLineMany: "+{count} أسطر",
    moreRemovedOne: "... {count} سطر محذوف إضافي",
    moreRemovedMany: "... {count} أسطر محذوفة إضافية",
    moreAddedOne: "... {count} سطر مضاف إضافي",
    moreAddedMany: "... {count} أسطر مضافة إضافية",
    truncated: "... (تم الاقتطاع)",
    editing: "جارٍ التحرير..."
  },
  chat: {
    you: "أنت",
    assistant: "المساعد",
    messageOne: "{count} رسالة",
    messageMany: "{count} رسائل"
  },
  code: {
    copyPath: "نسخ المسار",
    noResults: "لا توجد نتائج",
    searchResults: "نتائج البحث",
    noSymbols: "لم يتم العثور على رموز",
    noReferences: "لم يتم العثور على مراجع",
    unknownFile: "(غير معروف)",
    references: "المراجع",
    calledBy: "يُستدعى من",
    calls: "يستدعي",
    noCallGraph: "لا توجد بيانات لرسم الاستدعاءات",
    callersColon: "المستدعون:",
    dependentFiles: "الملفات التابعة",
    mostConnected: "الملفات الأكثر ترابطًا",
    imports: "الاستيرادات",
    importedBy: "مستورد من",
    label: {
      results: "النتائج",
      files: "الملفات",
      callers: "المستدعون",
      callees: "المستدعَون",
      imports: "الاستيرادات",
      dependents: "التابعون"
    },
    cat: {
      functions: "دوال",
      structs: "هياكل",
      enums: "تعدادات",
      traits: "سمات",
      impls: "impl",
      macros: "ماكرو",
      constants: "ثوابت",
      type_aliases: "أسماء مستعارة للأنواع"
    },
    symbols: {
      implementations: "التنفيذات",
      traits: "السمات",
      impls: "كتل impl"
    },
    symbolsNone: {
      implementations: "لم يتم العثور على تنفيذات",
      traits: "لم يتم العثور على سمات",
      impls: "لم يتم العثور على كتل impl"
    }
  },
  entity: {
    project: "المشروع",
    created: "تاريخ الإنشاء",
    plan: "الخطة",
    path: "المسار",
    synced: "المزامنة",
    target: "الهدف",
    verify: "التحقق",
    tasks: "المهام",
    constraints: "القيود",
    criteria: "معايير القبول",
    steps: "الخطوات",
    decisions: "القرارات",
    label: {
      tasks: "المهام",
      constraints: "القيود",
      criteria: "المعايير",
      steps: "الخطوات",
      decisions: "القرارات"
    },
    type: {
      plan: "الخطة",
      task: "المهمة",
      project: "المشروع",
      milestone: "المعلم",
      workspace: "مساحة العمل",
      note: "الملاحظة",
      release: "الإصدار"
    },
    view: {
      entity: "عرض {entity}",
      parentTask: "عرض المهمة الأصل",
      parentPlan: "عرض الخطة الأصل",
      linkedTask: "عرض المهمة المرتبطة",
      linkedPlan: "عرض الخطة المرتبطة"
    },
    deleted: "تم الحذف",
    updated: "تم التحديث",
    createdVerb: "تم الإنشاء",
    moreFields: "+{count} حقول إضافية"
  },
  list: {
    untitledPlan: "خطة بلا عنوان",
    untitledSession: "جلسة بلا عنوان",
    msgOne: "{count} رسالة",
    msgMany: "{count} رسائل",
    energy: "مستوى الطاقة",
    target: "الهدف: {date}",
    noResults: "لا توجد نتائج",
    resultOne: "{count} نتيجة",
    resultMany: "{count} نتائج",
    matching: "مطابقة لـ «{query}»"
  },
  viz: {
    noRadar: "لا تتوفر بيانات للرسم الراداري.",
    unknownTarget: "غير معروف",
    direct: "مباشر ({count})",
    transitive: "متعدٍّ ({count})",
    total: "{count} إجمالًا",
    importance: {
      critical: "حرج",
      high: "عالٍ",
      medium: "متوسط",
      low: "منخفض"
    },
    kind: {
      guideline: "إرشاد",
      gotcha: "مطبّ",
      pattern: "نمط",
      context: "سياق",
      tip: "نصيحة",
      observation: "ملاحظة",
      assertion: "تأكيد",
      decision: "قرار"
    }
  },
  permission: {
    actions: "الرد على طلب الإذن هذا",
    allowOnce: "السماح مرة واحدة",
    allowSession: "لهذه الجلسة",
    deny: "رفض",
    sessionHint: "لن يُطلب مجددًا في هذه المحادثة لهذا الاستدعاء نفسه (أي استدعاء لأداة للقراءة فقط)",
    awaiting: "في انتظار التأكيد…",
    scopeRefused: "لا يمكن الاحتفاظ بهذا الإذن للجلسة (الاستدعاء يشغّل أمرًا آخر، أو الجلسة لا توفّره). اسمح مرة واحدة أو ارفض.",
    allowed: "مسموح",
    allowedSession: "مسموح للجلسة",
    denied: "مرفوض"
  }
} satisfies Translation<'chatA-tools'>
