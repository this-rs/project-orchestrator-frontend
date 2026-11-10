# Types DTO générés (`src/types/generated/`)

Ces fichiers sont engendrés depuis les types serde du backend par
`cargo xtask ts-dto --write` (voir `xtask/src/ts_dto.rs` côté backend). Ils
sont la source de vérité du contrat REST pour le premier lot : `Note`,
`Task` (+ `TaskStatus`), `Project`, `Plan`. Le reste des DTO de
`src/types/index.ts` est encore copié à la main ; le basculement se fait
lot par lot.

## Garde-fou de contrat

Le garde-fou est **côté backend** :

```sh
# dans le dépôt backend
cargo xtask ts-dto --check --frontend <chemin/vers/frontend>
```

Il compare le dossier `generated/` commité à ce que le parseur régénère et
sort `1` en nommant le fichier et le champ qui dérivent.

Il n'y a **pas** de script `check:contract` dans le `package.json` de ce
dépôt : le sous-programme `ts-dto` vit dans le backend, qui n'est pas encore
fusionné avec lui. Un script qui lancerait `cargo xtask ts-dto --check` ici
échouerait toujours. Quand le backend est disponible, ajouter ce script
(pointeur vers le dépôt backend) plutôt que d'imiter la vérification.

## Deux interventions manuelles à connaître (et à faire disparaître)

Le générateur actuel a deux limites, compensées ici à la main :

1. **Imports manquants.** Les fichiers générés référencent leurs types voisins
   (`Note` référence `NoteType`, `NoteAnchor`…) sans `import`. Ils ont été
   complétés d'`import type` en tête de chaque fichier. Quand le générateur
   émettra les imports lui-même, ces lignes devront être retirées (sinon
   `--check` signalera « diffère hors des champs »).

2. **`Task.model_alias`.** Injecté par le handler `GET /tasks`
   (`src/api/handlers.rs`, setting LLM `task:{id}.model_alias`), ce n'est pas
   un champ serde de `TaskNode` : il n'est donc pas engendré. `src/types/index.ts`
   le ré-ajoute par `interface Task extends TaskNode { model_alias?: string | null }`.

Toute régénération (`--write`) écrase les `import type` ajoutés : rejouer le
correctif 1 juste après, jusqu'à ce que le générateur l'intègre.
