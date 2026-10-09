import type { Translation } from '../../catalog.ts'

export default {
  title: 'कमिट',
  empty: 'कोई कमिट नहीं',
  copy: 'SHA {sha} कॉपी करें',
  copied: '{sha} कॉपी किया गया',
  files: {
    one: 'फ़ाइलें: {count}',
    other: 'फ़ाइलें: {count}',
  },
  loadingFiles: 'फ़ाइलें लोड हो रही हैं…',
  noFiles: 'फ़ाइल का कोई विवरण उपलब्ध नहीं',
} satisfies Translation<'commits'>
