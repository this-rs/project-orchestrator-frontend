import type { Translation } from '../../catalog.ts'

export default {
  title: "Choisir un espace de travail",
  lead: "Un espace de travail regroupe les projets qui partagent un contexte et des objectifs. Choisissez celui dans lequel travailler.",
  notFound: "L'espace de travail « {slug} » est introuvable",
  notFoundBody: "Il a peut-être été supprimé ou renommé. Choisissez-en un autre ci-dessous.",
  loading: "Chargement des espaces de travail",
  errorTitle: "Erreur de connexion",
  errorBody: "Impossible de charger les espaces de travail. Le backend est-il démarré ?",
  create: "Créer un espace de travail",
  createSubmit: "Créer",
  creating: "Création…",
  cancel: "Annuler",
  nameLabel: "Nom de l'espace de travail",
  namePlaceholder: "Mon espace de travail",
  welcome: "Bienvenue dans Project Orchestrator",
  welcomeLead: "Créez votre premier espace de travail pour commencer.",
  createFirst: "Créer l'espace de travail",
  createFailed: "Impossible de créer l'espace de travail",
  updated: "mis à jour",
  explain: {
    what: "Un espace de travail regroupe plusieurs de vos projets qui partagent un contexte et des objectifs.",
    why: "Vous ouvrez un espace de travail et voyez ensemble ses projets, plans, notes et décisions ; Aujourd'hui montre ce qui vous attend dans tous.",
    different: "Au lieu d'un dossier par projet sans lien entre eux, les projets d'un espace de travail partagent ce qui a été décidé : un assistant qui travaille sur l'un sait ce que les autres ont tranché.",
  },
} satisfies Translation<'workspaceSelector'>
