# Project Orchestrator Frontend

Interface web pour Project Orchestrator — outil de gestion de projets, plans, tasks, milestones et notes.

## Stack technique

- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind CSS v4** — dark theme avec surfaces multi-niveaux
- **Jotai** — state management
- **React Router DOM 7** — routing
- **@dnd-kit/core** — drag & drop (Kanban boards)

## Prérequis

- Node.js 20+
- Backend API tournant sur `http://localhost:8080`

## Installation

```bash
npm install
npm run dev
```

Le serveur de dev démarre sur `http://localhost:3002`.

## Structure du projet

```
src/
├── atoms/          # Jotai atoms (state global)
├── components/
│   ├── forms/      # Formulaires de création (12 entités)
│   ├── kanban/     # Boards Kanban (tasks, plans, milestones)
│   └── ui/         # Composants UI réutilisables
├── hooks/          # Custom hooks
├── layouts/        # MainLayout (sidebar + breadcrumb)
├── pages/          # Pages liste + détail
├── services/       # Couche API (fetch wrapper)
└── types/          # Types TypeScript
```

## Pages

| Route | Description |
|-------|-------------|
| `/workspaces` | Workspaces (grille) |
| `/projects` | Projets (grille) |
| `/plans` | Plans avec Kanban/liste |
| `/tasks` | Tasks avec Kanban/liste |
| `/milestones` | Milestones avec Kanban/liste |
| `/notes` | Notes de connaissance |
| `/code` | Navigation code |

Chaque entité a une page de détail avec navigation par onglets sticky (SectionNav).

## Fonctionnalités

- **Kanban boards** — drag & drop pour changer les statuts, scroll infini par colonne
- **Steps dépliants** — sur PlanDetailPage, chevron pour voir les steps de chaque task inline
- **Toast notifications** — feedback visuel sur toutes les actions (succès/erreur)
- **Menu contextuel** `···` — actions destructives via OverflowMenu
- **StatusSelect** — sélecteur de statut avec dot coloré sur les pages de détail
- **Vue Kanban/Liste** — toggle persisté dans l'URL (`?view=kanban`)

## API Backend

Le frontend communique avec le backend via `http://localhost:8080/api`. La configuration du proxy est dans `vite.config.ts`.

Pagination : `?limit=100&offset=0` — max 100 items par requête.
