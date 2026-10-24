import type { Translation } from '../../catalog.ts'

export default {
  agent: {
    asked: "ما طُلب من الوكيل الفرعي",
    kind: "نوع الوكيل",
    answer: "جوابه",
    failed: "فشل الوكيل الفرعي",
    open: "فتح المحادثة الفرعية",
    openTitle: "فتح المحادثة التي عمل فيها هذا الوكيل الفرعي",
    running: "لا يزال الوكيل الفرعي يعمل…",
    noChild: "المحادثة الفرعية غير مدرجة بعد",
    noChildTitle: "يُستدل على المحادثة الابنة بمعرّف نداء الأداة هذا. وتظهر بمجرد أن يدرجها الخادم."
  },
  /** WebFetch / WebSearch: their result is data from the outside, never the assistant's text. */
  web: {
    externalSearch: "نتائج البحث: محتوى خارجي، لم يكتبه المساعد",
    externalPage: "محتوى الصفحة: محتوى خارجي، لم يكتبه المساعد",
  },
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
    },
    iso: {
      loading: "جارٍ تحميل المشهد ثلاثي الأبعاد…",
      composing: "جارٍ تأليف المشهد ثلاثي الأبعاد…",
      refused: "رُفض هذا المشهد ثلاثي الأبعاد — ما يجب تصحيحه:",
      moreProblems: "… و{count} أخرى",
      rebuild: "إعادة البناء",
      notJson: "هذا المشهد ثلاثي الأبعاد ليس JSON صالحًا ({detail}). نصه:",
      notObject: "يجب أن يكون هذا المشهد ثلاثي الأبعاد كائن JSON. نصه:",
      tooLarge: "هذا المشهد ثلاثي الأبعاد كبير جدًا ({max} حرفًا على الأكثر). نصه:",
      fullscreen: "ملء الشاشة",
      exitFullscreen: "الخروج من ملء الشاشة",
      live: {
        loading: "جارٍ قراءة الخطة…",
        unknownPlan: "لا توجد خطة {id}: لا شيء لعرضه مباشرة.",
        unreadable: "تعذّرت قراءة الخطة {id} ({detail}).",
        empty: "لا تحتوي هذه الخطة على مهام بعد: يبدأ المشهد بأول مهمة.",
        more: "+{count} أخرى",
        refused: "رفض المشهد تحديثًا:",
        label: "خطة مباشرة: {title}",
        status: {
          pending: "قيد الانتظار",
          blocked: "محظورة",
          in_progress: "قيد التنفيذ",
          completed: "منجزة",
          failed: "فاشلة",
          interrupted: "متوقفة"
        }
      }
    },
    mermaid: {
      title: "مخطط",
      loading: "جارٍ تحميل المخطط…",
      composing: "جارٍ كتابة المخطط…",
      refused: "رُفض هذا المخطط — يقول Mermaid:",
      empty: "هذا المخطط فارغ.",
      tooLarge: "هذا المخطط كبير جدًا ({max} حرف على الأكثر). نصّه:"
    },
    math: {
      composing: "جارٍ كتابة الصيغة…",
      refused: "رُفضت هذه الصيغة — يقول KaTeX:",
      empty: "هذه الصيغة فارغة.",
      tooLarge: "هذه الصيغة طويلة جدًا ({max} حرف على الأكثر). نصّها:"
    }
  },
  permission: {
    actions: "الرد على طلب الإذن هذا",
    allowOnce: "السماح مرة واحدة",
    allowSession: "لهذه الجلسة",
    deny: "رفض",
    sessionHint: "لن يُطلب مجددًا في هذه المحادثة لهذا الاستدعاء نفسه",
    awaiting: "في انتظار التأكيد…",
    sessionCovers: "إن مُنح، فإن «لهذه الجلسة» يشمل فقط:",
    forbidden: "لا يمكن الرد إلا لصاحب هذه المحادثة. لم يُرسل أي رد.",
    ownerUnreadable: "تعذّر التحقق من صاحب هذه المحادثة. لم يُرسل أي رد: حاول مرة أخرى.",
    unconfirmed: "لم يصل أي تأكيد. أجب مرة أخرى.",
    scopeRefused: "لا يمكن الاحتفاظ بهذا الإذن للجلسة (الاستدعاء يشغّل أمرًا آخر، أو الجلسة لا توفّره). اسمح مرة واحدة أو ارفض.",
    allowed: "مسموح",
    allowedSession: "مسموح للجلسة",
    denied: "مرفوض",
    allowAlways: "دائمًا",
    alwaysHint: "لن يُطلب مجددًا لهذا الاستدعاء بعينه في محادثاتك لهذا المشروع التي تعمل في مجلده، على هذا الجهاز؛ يُطلب مجددًا إذا غيّرت المحادثة مجلدها",
    alwaysCovers: "إذا مُنح، فإن «دائمًا» لا يغطي إلا:",
    destinationHint: 'جهة شبكية: نطاق الإذن يحدده المنسِّق ويذكره بمجرد أن تجيب',
    destinationCovers: 'هذا النداء يصل إلى:',
    destinationAlwaysHint: 'قد يُسجَّل كموافقة شبكية لهذا المشروع، معروضة وقابلة للإلغاء في الإعدادات → أدوات الشبكة',
    destinationAlwaysCovers: '«دائمًا» قد تُسجَّل كموافقة شبكية لهذا المشروع (الإعدادات → أدوات الشبكة).',
    originQuestion: "السماح بالوصول الشبكي إلى هذا الأصل؟",
    originScopes: "ما تغطيه كل إجابة",
    originOnce: "مرة واحدة: هذا الاستدعاء فقط. لا يُحتفظ بشيء.",
    originSession: "لهذه الجلسة: كل صفحات هذا الأصل حتى نهاية الجلسة. لا يُسجَّل شيء.",
    originSessionHint: "كل صفحات هذا الأصل، لهذه الجلسة",
    originAlways: "دائمًا: تُسجَّل كموافقة شبكية لهذا المشروع لـ:",
    originAlwaysRevocable: "مُدرجة وقابلة للإلغاء في الإعدادات → أدوات الشبكة.",
    originAlwaysHint: "تُسجَّل كموافقة شبكية لهذا المشروع، قابلة للإلغاء في الإعدادات → أدوات الشبكة",
    alwaysRefused: "لا يمكن السماح بهذا الاستدعاء بشكل دائم (فقط قراءة مطابقة، أو أمر للقراءة فقط دون إعادة توجيه أو تسلسل). أجب مرة واحدة أو للجلسة.",
    allowedAlways: "مسموح دائمًا"
  },
  lastingRules: {
    title: "الاستدعاءات المسموح بها دائمًا",
    description: "الاستدعاءات التي سمحت بها بشكل دائم، حسب المشروع. كل منها يغطي ذلك الاستدعاء بعينه فقط، في المحادثات التي تعمل في مجلد المشروع على هذا الجهاز. عند إلغائه، يُطلب مجددًا ابتداءً من الطلب التالي على هذا الجهاز.",
    empty: "لا يوجد استدعاء مسموح به بشكل دائم.",
    disabled: "هذا الخادم لا يحتفظ بأي موافقات دائمة.",
    revoke: "إلغاء",
    revoked: "أُلغي: سيُطلب مجددًا ابتداءً من الطلب التالي على هذا الجهاز.",
    loadFailed: "تعذّر تحميل موافقاتك الدائمة.",
    revokeFailed: "تعذّر الإلغاء. حاول مجددًا.",
    notHeld: "لم يعد ساريًا",
    engineNative: "المحرك الأصلي",
    engineClaudeCode: "Claude Code",
    sandboxDisabled: "خارج بيئة العزل"
  }
} satisfies Translation<'chatA-tools'>
