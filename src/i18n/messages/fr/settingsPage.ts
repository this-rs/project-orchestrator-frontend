import type { Translation } from '../../catalog.ts'

export default {
  back: "Retour",
  settings: {
    title: "Réglages",
    description: "Réglages de l'application de bureau. Ils s'appliquent à toutes les conversations avec les assistants.",
    chatTitle: "Chat et IA",
    chatDescription: "Mode de permission, outils autorisés et refusés, variables d'environnement et CLI Claude Code utilisée par les assistants.",
    updatesTitle: "Mises à jour",
    updatesDescription: "Vérifiez s'il existe une nouvelle version de l'application de bureau et installez-la.",
    providersNote: "Les providers (instances, consentement par projet, rôles et politique de modèles) ont leur propre page :",
    providersLink: "Providers → /providers",
    explain: {
      what: "Les réglages sont les choix de l'application de bureau elle-même : comment les assistants peuvent agir sur cette machine, et comment l'application se met à jour.",
      why: "Vous décidez une fois pour toutes ce qu'un assistant peut exécuter, quels outils il peut utiliser et quelle version vous utilisez.",
      different: "Aujourd'hui, ces choix sont dispersés entre fichiers de configuration et options de terminal. Ici, un seul écran, appliqué à toutes les conversations.",
    },
  },
  providers: {
    title: "Providers",
    description: "Où tournent vos conversations, ce que chaque projet peut y envoyer, et quel modèle fait quoi.",
    explain: {
      what: "Votre choix d'IA : Claude Code est intégré, et vous pouvez enregistrer un autre provider et l'autoriser projet par projet.",
      why: "Vous choisissez le provider et le modèle d'une conversation, et une clé n'est jamais saisie dans un formulaire : elle reste dans le coffre.",
      different: "Aujourd'hui un outil, c'est un seul modèle. Ici une conversation reste chez son provider, et l'assistant qui délègue une tâche peut nommer le provider et le modèle à y employer.",
    },
  },
} satisfies Translation<'settingsPage'>
