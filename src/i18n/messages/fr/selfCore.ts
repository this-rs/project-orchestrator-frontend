import type { Translation } from '../../catalog.ts'

export default {
  title: 'Noyau du soi',
  description:
    'Les notes dont part chaque tour d\'un assistant. Une personne les déclare : un assistant ne peut pas épingler les siennes.',
  scope: 'Portée',
  scopeGlobal: 'Tous les projets (global)',
  loading: 'Lecture du socle…',
  budget:
    'Au niveau L{level}, le socle dispose de {budget} caractères. Chaque note est ramenée à une ligne et coupée à {cap} caractères.',
  lands: '{count} de ces {total} notes tiennent dans ce budget ; les autres ne sont pas lues.',
  declaredHeading: 'Déclaré, dans cet ordre',
  proposalHeading: 'Proposition : rien n\'est encore déclaré',
  proposalHint: 'Aujourd\'hui, ces places reviennent à ce que le classement met en tête. Les déclarer, c\'est en faire votre choix.',
  empty: 'Rien n\'est déclaré, et le classement ne propose aucune note.',
  noteMeta: 'n°{n} · {type} · {importance} · {chars} caractères écrits',
  cut: 'seuls les {cap} premiers sont lus',
  landsNo: 'N\'entre pas : au-delà du budget, l\'assistant ne la lit jamais',
  quoteLabel: 'Ce que lit l\'assistant',
  declare: 'Déclarer ce noyau',
  later: 'Plus tard',
  laterNote: 'La question reviendra dans trois jours.',
  remove: 'Retirer',
  removeAria: 'Retirer la note {n} du noyau',
  tooMany: 'On ne peut pas déclarer plus de {count} notes.',
  saved: 'Déclaré. Le prochain tour part de là.',
  card: {
    settings: 'Ouvrir les réglages',
  },
  prompt: {
    title: 'Déclarer le noyau du soi ?',
    why: 'Rien n\'est encore déclaré : les notes dont part chaque tour sont choisies par un classement, pas par vous.',
    quote: 'Ce que l\'assistant lira, mot pour mot :',
    nothingWritten: 'Rien n\'est écrit avant votre réponse.',
    settings: 'Voir ce que ça donne',
  },
  error: {
    humanOnly: 'Seule une personne connectée peut déclarer ceci.',
    rootOnly: 'Seul le compte root peut déclarer le noyau de tous les projets.',
    tooMany: 'Trop de notes : le serveur a refusé la déclaration.',
    unknown: 'L\'une de ces notes n\'existe plus. Relisez la page.',
    outOfScope: 'Une note d\'un autre projet ne peut pas être déclarée ici : un noyau global ne prend que des notes globales.',
    read: 'Le socle n\'a pas pu être lu',
    write: 'Le noyau n\'a pas pu être déclaré',
  },
} satisfies Translation<'selfCore'>
