import type { Translation } from '../../catalog.ts'

export default {
  language: {
    label: "Язык",
    choose: "Выберите язык",
    current: "Язык: {name}",
    description: "Язык интерфейса. Ваш выбор сохраняется на этом устройстве.",
  },
} satisfies Translation<'common'>
