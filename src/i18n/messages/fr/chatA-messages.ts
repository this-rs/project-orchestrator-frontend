import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "Copier en markdown",
    copied: "Copié !",
    popupTitle: "Markdown du message"
  },
  compact: {
    label: "Contexte compacté",
    trigger: {
      auto: "auto",
      manual: "manuel"
    },
    tokens: "~{count} k tokens"
  },
  continued: {
    label: "Poursuivi",
    afterOne: "après {count} tour",
    afterMany: "après {count} tours"
  },
  bubble: {
    references: "Références",
    attachments: "Pièces jointes",
    copyMessage: "Copier le message en markdown",
    copyReply: "Copier la réponse en markdown",
    thinking: "Réflexion..."
  },
  list: {
    loading: "Chargement des messages...",
    loadingOlder: "Chargement des messages précédents...",
    beginning: "— Début de la conversation —",
    loadingNewer: "Chargement des messages suivants...",
    scrollMore: "— Faites défiler pour en voir plus —",
    catchingUp: "Rattrapage…",
    newActivity: "Nouvelle activité ↓"
  },
  compaction: {
    label: "Compactage du contexte"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "Que souhaitez-vous faire ?",
    quickActions: "Actions rapides",
    selectProject: "Sélectionnez un projet ci-dessus pour utiliser les actions rapides",
    projectStatus: "État du projet",
    activePlanOne: "{count} plan actif",
    activePlanMany: "{count} plans actifs",
    toReview: "{count} à relire",
    allClear: "Tout est à jour",
    notesOne: "{count} note",
    notesMany: "{count} notes",
    synced: "Synchronisé {when}",
    untitled: "Sans titre",
    untitledConversation: "Conversation sans titre",
    recent: "Conversations récentes",
    actions: {
      next: {
        label: "Prochaine tâche",
        description: "Obtenir la prochaine tâche disponible",
        prompt: "Quelle est la prochaine tâche disponible du plan actif ? Montre-moi son contexte et ses étapes."
      },
      plan: {
        label: "Planifier quelque chose",
        description: "Planifier une implémentation",
        prompt: "Planifie l’implémentation de : "
      },
      impact: {
        label: "Analyse d’impact",
        description: "Analyser l’impact d’un changement",
        prompt: "Analyse l’impact de la modification de : "
      },
      arch: {
        label: "Architecture",
        description: "Vue d’ensemble du code",
        prompt: "Donne-moi une vue d’ensemble de l’architecture du projet"
      },
      search: {
        label: "Recherche de code",
        description: "Rechercher dans le code",
        prompt: "Cherche dans le code : "
      },
      roadmap: {
        label: "Feuille de route",
        description: "Jalons et releases",
        prompt: "Montre-moi la feuille de route complète avec les jalons et les releases"
      }
    },
    time: {
      now: "à l’instant",
      minutes: "il y a {count} min",
      hours: "il y a {count} h",
      days: "il y a {count} j",
      months: "il y a {count} mois"
    },
    plan: {
      draft: "Brouillon",
      approved: "Approuvé",
      in_progress: "En cours",
      completed: "Terminé",
      cancelled: "Annulé"
    }
  },
  panel: {
    connected: "Connecté",
    reconnecting: "Reconnexion…",
    disconnected: "Déconnecté",
    connectionLost: "Connexion perdue",
    exportTitle: "Export du chat",
    newChatTitle: "Nouveau chat",
    chatTitle: "Chat",
    conversations: "Conversations",
    newConversation: "Nouvelle conversation",
    backToChat: "Retour au chat",
    sessions: "Sessions",
    newChat: "Nouveau chat",
    assistantTree: "Arbre des assistants",
    permissionSettings: "Paramètres de permissions",
    copied: "Copié !",
    copyChat: "Copier le chat en markdown",
    exitFullscreen: "Quitter le plein écran",
    close: "Fermer",
    backToParent: "Retour au parent",
    actions: "Actions de la conversation",
    attach: "Rattacher à un plan ou une tâche…",
    hideTree: "Masquer l’arbre des assistants",
    showTree: "Afficher l’arbre des assistants",
    fullscreen: "Plein écran",
    noProjectsTitle: "Aucun projet pour l’instant",
    noProjectsBody: "Ajoutez un projet à cet espace de travail pour démarrer une conversation avec Claude.",
    addProject: "Ajouter un projet"
  }
} satisfies Translation<'chatA-messages'>
