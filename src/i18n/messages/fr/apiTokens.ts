import type { Translation } from '../../catalog.ts'

export default {
  title: 'Jetons API',
  description: 'Jetons longue durée pour accéder à l\'API par programme. Un jeton fonctionne comme un mot de passe — gardez-le secret.',
  explain: {
    what: 'Un jeton API permet à un service externe d\'appeler votre Project Orchestrator en votre nom.',
    why: 'Scripts, pipelines CI et autres outils peuvent lire plans, notes et décisions sans session navigateur.',
    different: 'Aujourd\'hui il faut une connexion navigateur. Avec un jeton, une commande curl ou un script fonctionne de la même façon.',
  },
  empty: 'Aucun jeton API pour l\'instant.',
  emptyHint: 'Créez-en un pour utiliser l\'API depuis des services externes.',
  create: {
    title: 'Nouveau jeton',
    label: 'Libellé',
    labelPlaceholder: 'ex. pipeline CI, script de monitoring',
    labelRequired: 'Un libellé est requis.',
    expiryDays: 'Expire après (jours)',
    expiryHelp: 'Entre 1 et 365 jours. Par défaut : 90.',
    submit: 'Créer le jeton',
    creating: 'Création…',
  },
  reveal: {
    title: 'Jeton créé',
    warning: 'Copiez ce jeton maintenant — il ne sera plus affiché.',
    copied: 'Copié dans le presse-papiers.',
    copy: 'Copier',
    done: 'Terminé',
  },
  table: {
    label: 'Libellé',
    scope: 'Portée',
    created: 'Créé le',
    expires: 'Expire le',
    status: 'Statut',
    actions: 'Actions',
  },
  status: {
    active: 'Actif',
    revoked: 'Révoqué',
    expired: 'Expiré',
  },
  revoke: {
    button: 'Révoquer',
    confirm: 'Révoquer ce jeton ? Il cessera de fonctionner immédiatement.',
    title: 'Révoquer le jeton',
    success: 'Jeton révoqué.',
  },
  purge: {
    button: 'Purger les expirés et révoqués',
    success: '{count} jeton(s) mort(s) supprimé(s).',
    none: 'Rien à purger.',
  },
  errors: {
    loadFailed: 'Impossible de charger les jetons.',
    createFailed: 'Impossible de créer le jeton.',
    revokeFailed: 'Impossible de révoquer le jeton.',
    purgeFailed: 'Impossible de purger les jetons.',
  },
} satisfies Translation<'apiTokens'>
