import type { Translation } from '../../catalog.ts'

export default {
  description: 'कार्यान्वयन के चरणों की योजना बनाएँ और उन्हें ट्रैक करें',
  newPlan: 'नया योजना',
  searchPlaceholder: 'योजना खोजें…',
  allStatuses: 'सभी स्थितियाँ',
  project: 'प्रोजेक्ट',
  listLabel: 'योजना',
  selectPlan: '{title} चुनें',
  createdBy: '{name} द्वारा बनाया गया',
  loaded: '{total} में से {loaded} लोड हुए',
  count: {
    one: 'योजना: {count}',
    other: 'योजना: {count}',
  },
  empty: {
    pristineTitle: 'अभी कोई योजना नहीं',
    pristineBody: 'अपने विकास कार्य को व्यवस्थित करने के लिए योजना बनाएँ।',
    filteredTitle: 'कोई मेल खाता योजना नहीं',
    filteredBody: 'अपनी खोज या फ़िल्टर बदलकर देखें।',
  },
  toast: {
    created: 'योजना बनाया गया',
    updated: 'योजना अपडेट किया गया',
    deleted: 'योजना हटाया गया',
    deletedMany: {
      one: 'हटाए गए योजना: {count}',
      other: 'हटाए गए योजना: {count}',
    },
  },
  dialog: {
    create: 'योजना बनाएँ',
    edit: 'योजना संपादित करें',
  },
  confirm: {
    deleteTitle: 'योजना हटाएँ?',
    deleteBody: 'यह योजना और इसके सभी कार्य स्थायी रूप से हटा दिए जाएँगे।',
    bulkTitle: {
      one: 'योजना हटाएँ ({count})?',
      other: 'योजना हटाएँ ({count})?',
    },
    bulkBody: {
      one: 'चयनित योजना ({count}) और उनके सभी कार्य स्थायी रूप से हटा दिए जाएँगे।',
      other: 'चयनित योजना ({count}) और उनके सभी कार्य स्थायी रूप से हटा दिए जाएँगे।',
    },
  },
} satisfies Translation<'plans'>
