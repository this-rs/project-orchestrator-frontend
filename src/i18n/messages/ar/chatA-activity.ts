import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "تشغيل",
    workflow: "سير عمل",
    agent: "وكيل",
    shell: "صدفة",
    monitor: "مراقب"
  },
  kindCount: {
    run: {
      one: "{count} تشغيل",
      many: "{count} تشغيلات"
    },
    workflow: {
      one: "{count} سير عمل",
      many: "{count} مسارات عمل"
    },
    agent: {
      one: "{count} وكيل",
      many: "{count} وكلاء"
    },
    shell: {
      one: "{count} صدفة",
      many: "{count} أصداف"
    },
    monitor: {
      one: "{count} مراقب",
      many: "{count} مراقبين"
    }
  },
  row: {
    progress: "{settled}/{total} وكلاء",
    stopping: "جارٍ الإيقاف…",
    stoppingTitle: "جارٍ الإيقاف…",
    stop: "إيقاف",
    stopAria: "إيقاف {title}",
    stopRun: "إيقاف هذا التشغيل",
    show: "إظهار في المحادثة",
    showAria: "إظهار {title} في المحادثة",
    openConversation: "فتح محادثته",
    openConversationAria: "فتح محادثة {title}",
    dashboard: "فتح لوحة تحكم المشغّل",
    dashboardAria: "فتح لوحة تحكم المشغّل الخاصة بـ {title}"
  },
  bar: {
    tooFast: "الإلغاء سريع جدًا — حاول مرة أخرى بعد لحظة.",
    cancelFailed: "تعذّر إلغاء المهمة — استخدم زر الإيقاف العام بدلًا من ذلك.",
    runningAria: "قيد التشغيل: {summary}",
    stoppedOne: "تم إيقاف {count} عملية فرعية.",
    stoppedMany: "تم إيقاف {count} عمليات فرعية.",
    noPid: "تم تسجيل الإلغاء، لكن معرّف PID للعملية الفرعية كان غير معروف — إذا استمرت الإشارات في الوصول، فاستخدم زر الإيقاف العام."
  },
  agent: {
    subAgent: "وكيل فرعي",
    toolOne: "{count} أداة",
    toolMany: "{count} أدوات",
    running: "{count} قيد التشغيل",
    runningIndicator: "الوكيل قيد التشغيل..."
  },
  status: {
    spawning: "قيد البدء",
    running: "قيد التشغيل",
    verifying: "قيد التحقق",
    completed: "مكتمل",
    failed: "فشل",
    interrupted: "تمت المقاطعة"
  },
  banner: {
    elapsed: "المنقضي",
    cost: "التكلفة",
    ram: "الذاكرة RAM (المقيمة)",
    cpu: "وحدة المعالجة CPU",
    pidTitle: "PID {pid} · {threads} خيوط · {status}",
    viewAgent: "عرض محادثة هذا الوكيل",
    view: "عرض",
    interrupt: "مقاطعة هذا الوكيل",
    runTitle: "التشغيل {id}",
    runShort: "تشغيل {id}",
    wave: "الموجة {wave}",
    openDashboard: "فتح لوحة تحكم المشغّل الكاملة",
    dashboard: "لوحة التحكم",
    spawning: "جارٍ بدء الوكلاء…",
    noAgents: "لا يوجد وكلاء نشطون",
    title: "وضع الوكيل",
    activeOne: "{count} تشغيل نشط",
    activeMany: "{count} تشغيلات نشطة",
    cumulative: "المجموع التراكمي {cost}"
  },
  pill: {
    title: "وضع الوكيل",
    state: {
      idle: "خامل",
      ready: "جاهز",
      running: "قيد التشغيل",
      completed: "مكتمل"
    },
    workingOne: "وضع الوكيل — {count} وكيل يعمل",
    workingMany: "وضع الوكيل — {count} وكلاء يعملون",
    completedOne: "وضع الوكيل — اكتمل {count} تشغيل",
    completedMany: "وضع الوكيل — اكتملت {count} تشغيلات",
    ready: "وضع الوكيل — جاهز",
    streamingOne: "{count} تشغيل قيد البث حاليًا. يعرض الشريط أدناه الوكلاء في الوقت الفعلي.",
    streamingMany: "{count} تشغيلات قيد البث حاليًا. يعرض الشريط أدناه الوكلاء في الوقت الفعلي.",
    more: "+ {count} إضافي",
    readyNote: "توجد خطط مرتبطة بهذه المحادثة لكن لا شيء منها قيد البث حاليًا.",
    ranOne: "تم إطلاق {count} تشغيل من هذه المحادثة. لا شيء منها قيد البث حاليًا.",
    ranMany: "تم إطلاق {count} تشغيلات من هذه المحادثة. لا شيء منها قيد البث حاليًا.",
    openDashboard: "فتح لوحة تحكم المشغّل"
  },
  bg: {
    title: "نشاط في الخلفية",
    listAria: "أنشطة الخلفية",
    summary: {
      running: "{count} قيد التشغيل",
      queued: "{count} في الانتظار",
      failed: "{count} فاشل",
      done: "{count} منجز",
      cancelled: "{count} ملغى",
      ended: "{count} منتهٍ"
    }
  },
  card: {
    showMore: "عرض المزيد",
    showLess: "عرض أقل",
    lineOne: "{count} سطر",
    lineMany: "{count} أسطر",
    earlierLineOne: "عرض {count} سطر سابق",
    earlierLineMany: "عرض {count} أسطر سابقة",
    progressOf: "تقدّم {title}",
    agents: "{settled}/{total} وكلاء",
    agentsOf: "وكلاء {title}",
    tokens: "{count} رمز",
    toolUseOne: "{count} استخدام للأداة",
    toolUseMany: "{count} استخدامات للأدوات",
    timeline: "الجدول الزمني",
    eventOne: "{count} حدث",
    eventMany: "{count} أحداث",
    eventsOf: "أحداث {title}",
    hiddenEventOne: "… {count} حدث سابق غير محفوظ",
    hiddenEventMany: "… {count} أحداث سابقة غير محفوظة",
    rawPayload: "البيانات الخام",
    parameters: "المعاملات",
    latestOutput: "أحدث مخرجات",
    output: "المخرجات",
    kind: {
      workflow: "سير عمل",
      shell: "أمر في الخلفية",
      monitor: "مراقب",
      agent: "وكيل فرعي",
      generic: "نشاط في الخلفية"
    },
    status: {
      running: "قيد التشغيل",
      queued: "في الانتظار",
      done: "منجز",
      failed: "فشل",
      cancelled: "ملغى",
      ended: "منتهٍ"
    }
  },
  runs: {
    finished: "منتهٍ",
    view: "عرض التشغيل",
    stop: "إيقاف التشغيل",
    loading: "جارٍ تحميل عمليات التنفيذ…",
    noDetails: "لا توجد تفاصيل تنفيذ متاحة.",
    inProgressOne: "{count} تشغيل قيد التنفيذ",
    inProgressMany: "{count} تشغيلات قيد التنفيذ",
    completedOne: "اكتمل {count} تشغيل",
    completedMany: "اكتملت {count} تشغيلات",
    done: "{count} منجز"
  }
} satisfies Translation<'chatA-activity'>
