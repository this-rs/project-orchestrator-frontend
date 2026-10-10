import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: "اعتماد التعديلات تلقائيًا",
    ask: "اسأل",
    plan_only: "التخطيط فقط",
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: "قبول التعديلات",
    ask: "افتراضي",
    plan_only: "التخطيط فقط",
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: "قبول التعديلات",
    ask: "طلب الأذونات",
    plan_only: "وضع التخطيط",
  },
  native: {
    auto: { short: "تلقائي", long: "الوضع التلقائي" },
    dontAsk: { short: "لا تسأل", long: "لا تسأل" },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: "اعتماد كل الأدوات تلقائيًا. بلا مطالبات." },
      auto_edits: { label: "قبول التعديلات", description: "اعتماد تعديلات الملفات تلقائيًا، والسؤال عن الأوامر." },
      ask: { label: "افتراضي", description: "السؤال عند كل استخدام للأدوات." },
      plan_only: { label: "التخطيط فقط", description: "وضع القراءة فقط. بلا كتابة ولا أوامر." },
    },
    neutral: {
      trust: { description: "تشغيل كل أداة دون سؤال." },
      auto_edits: { description: "تعديلات الملفات تُنفَّذ دون سؤال؛ أما الأوامر فيُسأل عنها." },
      ask: { description: "السؤال قبل كل استدعاء لأداة." },
      plan_only: { description: "للقراءة فقط. بلا كتابة ولا أوامر." },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: "كل الأدوات معتمدة تلقائيًا — بلا مطالبات أذونات",
      summary: "Rock'n roll (كل شيء معتمد تلقائيًا)",
    },
    ask: {
      label: "افتراضي",
      description: "يطلب الموافقة على تعديلات الملفات وأوامر الصدفة",
      summary: "افتراضي (السؤال عن التعديلات والصدفة)",
    },
    auto_edits: {
      label: "قبول التعديلات",
      description: "تعديلات الملفات معتمدة تلقائيًا، وأوامر الصدفة تحتاج إلى موافقة",
      summary: "قبول التعديلات (السؤال عن الصدفة فقط)",
    },
    plan_only: {
      label: "التخطيط فقط",
      description: "وضع القراءة فقط — يستطيع Claude القراءة دون تعديل الملفات",
      summary: "التخطيط فقط (للقراءة فقط)",
    },
  },
  trustRequiresSandbox: "غير متاح: هذا الجهاز البعيد لا يسمح بهذا الوضع. فعّله في إعدادات النسخة لتشغيل أدواتها دون تأكيد.",
  rulesUnsupported: "قواعد السماح والمنع خاصة بـ Claude Code. هذا المزوّد لا يطبّقها، لذا لا تُعرض: وضع الأذونات أعلاه هو الذي يحكم أدواته.",
  trustDowngraded: "استُبدل وضع «Rock’n roll» بوضع «اسأل»: هذا الجهاز البعيد لا يسمح به.",
} satisfies Translation<'toolPolicy'>
