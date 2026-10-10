import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "Réponse :",
    placeholder: "Ou saisissez votre réponse...",
    submit: "Envoyer",
    notSent: "Non envoyé : connexion perdue. Votre réponse est conservée, réessayez une fois reconnecté."
  },
  attachments: {
    processing: "Traitement…",
    remove: "Retirer",
    removeAria: "Retirer {name}",
    pendingSend: "Le message sera envoyé à la fin du téléversement"
  },
  upload: {
    network: "Erreur réseau — le fichier n’a jamais atteint le serveur",
    timeout: "Le serveur n’a pas répondu à temps — retirez le fichier et ajoutez-le de nouveau",
    tooLarge: "Fichier trop volumineux",
    unsupported: "Format de fichier non pris en charge",
    unreadable: "Le fichier n’a pas pu être lu (mal formé ou endommagé)",
    forbidden: "Téléversement non autorisé ici",
    failed: "Échec du téléversement (HTTP {status})"
  },
  action: {
    send: "Envoyer le message",
    stop: "Arrêter la génération",
    stopping: "Arrêt en cours…",
    waiting: "En attente de la fin du téléversement des pièces jointes",
    idle: "Envoyer le message",
    removeFailed: "Retirez d’abord la pièce jointe en échec",
    waitingUpload: "En attente de la fin du téléversement"
  },
  composer: {
    imageName: "image",
    alreadyIn: "{label} est déjà dans le message.",
    added: "{label} ajouté au message.",
    close: "Fermer",
    maxRefs: "Maximum de {max} références par message : la dernière n’a pas été ajoutée.",
    references: "Références",
    placeholder: "Envoyer un message...",
    attach: "Joindre un fichier",
    override: "(remplacé)",
    default: "par défaut",
    auto: "Auto",
    autoOn: "Poursuite automatique activée",
    autoOff: "Poursuite automatique désactivée",
    drop: "Déposez pour joindre"
  }
} satisfies Translation<'chatA-input'>
