import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'الشيفرة', description: 'الملفات والدوال والبُنى والسمات' },
    pm: { label: 'المشروع', description: 'الخطط والمهام والأهداف' },
    knowledge: { label: 'المعرفة', description: 'الملاحظات والقرارات والقيود' },
    fabric: { label: 'النسيج', description: 'IMPORTS وCALLS وCO_CHANGED' },
    neural: { label: 'العصبي', description: 'المشابك والطاقة والتنشيط' },
    skills: { label: 'المهارات', description: 'مجموعات معرفة ناشئة' },
    behavioral: { label: 'السلوكي', description: 'البروتوكولات والحالات والانتقالات (FSM)' },
    chat: { label: 'الدردشة', description: 'جلسات الدردشة والكيانات التي نوقشت' },
  },
  preset: {
    code_only: { label: 'الشيفرة', description: 'بنية الشيفرة وحدها' },
    knowledge_overlay: { label: 'المعرفة', description: 'الملاحظات والقرارات فوق الشيفرة' },
    neural_view: { label: 'العصبي', description: 'الشبكة العصبية والمهارات والبروتوكولات' },
    pm_view: { label: 'المشروع', description: 'الخطط والمهام والأهداف' },
    impact_mode: { label: 'الأثر', description: 'تحليل الأثر' },
    behavioral_view: { label: 'السلوكي', description: 'البروتوكولات والمهارات والملاحظات وروابطها' },
    full_stack: { label: 'كامل', description: 'كل الطبقات' },
  },
  group: {
    core: 'الأساس',
    code: 'الشيفرة',
    knowledge: 'المعرفة',
    git: 'Git',
    sessions: 'الجلسات',
    features: 'الميزات',
    behavioral: 'السلوكي',
  },
  scale: { workspace: 'المشاريع', project: 'الخطط + الأهداف', plan: 'المهام', task: 'الخطوات' },
} satisfies Translation<'intelConfig'>
