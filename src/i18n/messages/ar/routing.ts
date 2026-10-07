import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'الأساسي فقط', description: 'مزوّد أساسي واحد حصري، كما هو اليوم. يكتفي PO بتسجيل ما كان سيختاره.' },
    mixed: { label: 'مختلط', description: 'يقود المزوّد الأساسي المحادثة، ويوجّه PO المنفّذين.' },
    full: { label: 'كامل', description: 'يختار PO كل شيء ويشرح السبب.' },
  },
  stages: {
    shadow: { label: 'ظلّي', description: 'لا يُطبَّق شيء؛ يُسجَّل كل قرار.' },
    advisory: { label: 'استشاري', description: 'يقترح PO وتؤكد أنت.' },
    auto: { label: 'تلقائي', description: 'يطبّق PO قراراته.' },
  },
  routedBy: {
    session: 'اختير للجلسة',
    request: 'اختير في الطلب',
    task: 'اختير بواسطة المهمة',
    persona: 'اختير بواسطة الشخصية',
    run: 'اختير بواسطة التشغيل',
    project_rule: 'قاعدة المشروع',
    global_rule: 'قاعدة عامة',
    default: 'الافتراضي للخادم',
    claude_code: 'بديل Claude Code',
    fallback: 'سلسلة البدائل',
    auto: 'اختار PO',
  },
  rejection: {
    not_allowed: 'غير مسموح لهذا المشروع',
    unhealthy: 'غير سليم',
    no_tools: 'لا يستطيع استدعاء الأدوات',
    context_too_small: 'نافذة السياق صغيرة جدًا',
    no_images: 'لا يقرأ الصور',
    over_budget: 'تجاوز الميزانية',
    trust_without_sandbox: 'وضع الثقة دون صندوق رمل',
    remote: 'بعيد، غير مسموح هنا',
  },
  badge: { poChooses: 'PO يختار', why: 'لماذا؟' },
  advanced: { force: 'متقدم: فرض مزوّد/نموذج لهذه المحادثة' },
  picker: { primary: 'الأساسي: {target} · PO يوجّه المنفّذين', forced: 'مفروض: {target}', willChoose: 'سيختار PO عند أول رسالة', routedBy: 'تم التوجيه بواسطة: {by}', aria: 'التوجيه: {mode}' },
  reason: 'السبب: {reason}',
  settings: { title: 'التوجيه', confirmAuto: 'سيطبّق PO اختياراته بنفسه الآن دون سؤال. هل تتابع؟' },
  report: { agreement: 'التوافق مع الاختيار الفعلي', costDelta: 'فرق التكلفة التقديري', unknown: 'غير معروف' },
} satisfies Translation<'routing'>
