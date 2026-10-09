import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'خدمة',
    frontend: 'واجهة أمامية',
    worker: 'عامل',
    database: 'قاعدة بيانات',
    message_queue: 'طابور',
    cache: 'ذاكرة تخزين مؤقت',
    gateway: 'بوابة',
    external: 'خارجي',
    library: 'مكتبة',
    cli: 'CLI',
    other: 'أخرى',
  },
  tiers: {
    entry: 'نقاط الدخول',
    gateway: 'البوابة',
    services: 'الخدمات',
    libraries: 'المكتبات والمراسلة والتخزين المؤقت',
    data: 'البيانات والأنظمة الخارجية',
    other: 'أخرى',
  },
  legend: {
    required: 'مطلوب',
    optional: 'اختياري — يعمل النظام بدونه',
    direction: 'من اليسار إلى اليمين: مكان دخول المستخدمين ← الخدمات ← البيانات',
    select: 'اختر مكوّنًا لمعرفة ما سيتوقف بدونه',
  },
  panel: {
    details: 'تفاصيل {name}',
    close: 'إغلاق التفاصيل',
    optional: 'اختياري',
    dependedOnBy: 'تعتمد عليه ({n})',
    dependsOn: 'يعتمد على ({n})',
    nothingDependsOnThis: 'لا شيء يعتمد على هذا.',
    dependsOnNothing: 'لا يعتمد على شيء.',
    derivedFrom: 'مشتق من {source}',
  },
  description: 'النظام كما بُني: المكوّنات وما يعتمد على ماذا.',
  loadFailed: 'تعذّر تحميل البنية',
  emptyTitle: 'لا توجد بنية بعد',
  emptyDescription:
    'أضف مكوّنات (خدمات، قواعد بيانات، طوابير…) إلى مساحة العمل، أو اطلب من مساعد رسم خريطة للنظام.',
  graphLabel: 'مخطط البنية',
  outline: 'مخطط تفصيلي للبنية',
} satisfies Translation<'architecture'>
