import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'कोड', description: 'फ़ाइलें, फ़ंक्शन, स्ट्रक्ट, ट्रेट' },
    pm: { label: 'प्रोजेक्ट', description: 'योजनाएँ, कार्य, उद्देश्य' },
    knowledge: { label: 'ज्ञान', description: 'नोट्स, निर्णय, बाधाएँ' },
    fabric: { label: 'ताना-बाना', description: 'IMPORTS, CALLS, CO_CHANGED' },
    neural: { label: 'न्यूरल', description: 'सिनैप्स, ऊर्जा, सक्रियता' },
    skills: { label: 'कौशल', description: 'उभरते ज्ञान-समूह' },
    behavioral: { label: 'व्यवहारगत', description: 'प्रोटोकॉल, अवस्थाएँ, परिवर्तन (FSM)' },
    chat: { label: 'चैट', description: 'चैट सत्र और चर्चा में आई इकाइयाँ' },
  },
  preset: {
    code_only: { label: 'कोड', description: 'शुद्ध कोड आर्किटेक्चर' },
    knowledge_overlay: { label: 'ज्ञान', description: 'कोड पर नोट्स और निर्णय' },
    neural_view: { label: 'न्यूरल', description: 'न्यूरल नेटवर्क, कौशल और प्रोटोकॉल' },
    pm_view: { label: 'प्रोजेक्ट', description: 'योजनाएँ, कार्य, उद्देश्य' },
    impact_mode: { label: 'प्रभाव', description: 'प्रभाव विश्लेषण' },
    behavioral_view: { label: 'व्यवहारगत', description: 'प्रोटोकॉल, कौशल, नोट्स और आपसी संबंध' },
    full_stack: { label: 'पूर्ण', description: 'सभी परतें' },
  },
  group: {
    core: 'मूल',
    code: 'कोड',
    knowledge: 'ज्ञान',
    git: 'Git',
    sessions: 'सत्र',
    features: 'फ़ीचर',
    behavioral: 'व्यवहारगत',
  },
  scale: { workspace: 'प्रोजेक्ट', project: 'योजनाएँ + उद्देश्य', plan: 'कार्य', task: 'चरण' },
} satisfies Translation<'intelConfig'>
