import type { Translation } from '../../catalog.ts'

export default {
  language: {
    label: "Langue",
    choose: "Choisir une langue",
    current: "Langue : {name}",
    description: "Langue de l'interface. Votre choix est conservé sur cet appareil.",
  },
} satisfies Translation<'common'>
