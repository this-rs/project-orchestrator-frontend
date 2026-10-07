import type { Translation } from '../../catalog.ts'

export default {
  language: {
    label: "Мова",
    choose: "Виберіть мову",
    current: "Мова: {name}",
    description: "Мова інтерфейсу. Ваш вибір зберігається на цьому пристрої.",
  },
} satisfies Translation<'common'>
