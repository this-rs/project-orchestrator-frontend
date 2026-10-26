# 04 — Projection des AST de code en représentations mécaniques instantanées

**Périmètre.** Ce document est la **spec de projection** : comment un arbre de syntaxe de code (AST) est transformé,
directement et instantanément, en une représentation 3D « mécanique » (modules → assemblages, fonctions → mécanismes,
flux de contrôle → liaisons, flux de données → tuyaux). Il ne contient **aucun code d'implémentation** : uniquement les
contrats, les tables de correspondance et les règles de budget.

**Sources de vérité lues (lecture seule) :**
- Backend — parseur tree-sitter : `backend/src/parser/mod.rs`, `parser/helpers.rs`, `parser/ast_cache.rs`, `parser/languages/*`
  (18 langages : rust, typescript, python, go, java, c, cpp, ruby, php, kotlin, swift, bash, csharp, scala, zig, hcl, dart +…).
- Backend — modèle de données : `backend/src/neo4j/models.rs` (`ParsedFile` et ses nœuds).
- Frontend — contrat de scène : `frontend/src/vendor/three-iso/scene.ts`, `ast.ts`, `catalog.ts`, `meaning.ts`, `mechanisms.ts`.

---

## 1. Pipeline AST → scène

Le pipeline comporte **quatre étages**, chacun une fonction pure de l'étage précédent. Il est déterministe : le même
contenu de fichier produit la même scène, au détail de rendu près.

```
                    ┌────────────────────────────────────────────────────────────────────────┐
 source (18 lang.) │  (1) PARSE            (2) NORMALISATION        (3) MAPPING SÉMANTIQUE  │ (4) NŒUDS DE SCÈNE
 ──────────────────►  tree-sitter     ───►   CodeIR (vocabulaire  ───►  SceneProjection       ───►  SceneSpec /
                    ParsedFile (entité)      mécanique canonique)       (IsoNode / MechId)         SceneStation
                    └────────────────────────────────────────────────────────────────────────┘
```

### Étage 1 — Parse (tree-sitter)
Le backend **existant** `CodeParser` produit un `ParsedFile`. C'est un AST **au niveau entité**, pas au niveau
instruction :

| Champ de `ParsedFile` | Contenu | Usage pour la projection |
|---|---|---|
| `functions: Vec<FunctionNode>` | définitions de fonctions/méthodes (`name`, `params`, `return_type`, `complexity` cyclomatique, `is_async`, `is_unsafe`, `line_start/end`) | mécanismes (taille = `complexity`) |
| `structs: Vec<StructNode>` | classes/structs (`parent_class`, `interfaces`) | assemblages (conteneurs de mécanismes) |
| `traits` / `enums` | interfaces, variantes | assemblages de contrat / sélecteurs |
| `imports: Vec<ImportNode>` | dépendances (`path`, `alias`, `items`) | liaisons externes (chaînes/liens sortants) |
| `impl_blocks: Vec<ImplNode>` | rattachement méthodes ↔ type | regroupement mécanisme ↔ assemblage |
| `function_calls: Vec<FunctionCall>` | arêtes `caller_id → callee_name` (`confidence`, `reason`) | liaisons d'appel (tuyaux) |
| `symbols` | index de noms | résolution d'étiquettes |

> **Constat important (vérifié).** Le parseur actuel n'émet **pas** de nœuds de flux de contrôle ni de flux de données :
> `ParsedFile` ne contient ni boucles, ni branches, ni affectations. La preuve qu'on *peut* les extraire existe déjà :
> `calculate_complexity` (dans `helpers.rs`) parcourt **tout l'arbre** via un `TreeCursor` et compte les nœuds
> `if_statement`, `while_statement`, `for_statement`, `match_arm`, `case_clause`, `catch_clause`, `ternary_expression`,
> `&&`, `||`, etc. La projection ne dépend donc pas d'une refonte du parseur : elle projette ce qui existe (étage
> entité) et **définit** l'extension contrôle/données comme un passe optionnel (voir §2, colonnes « source » et §3).

### Étage 2 — Normalisation → `CodeIR`
Les 18 langages ont des noms de nœuds tree-sitter différents (`if_expression` vs `if_statement`, `match_arm` vs
`case_clause`). La normalisation replie cette diversité sur un **vocabulaire mécanique canonique** de sept primitives.
Chaque primitive `CodeIR` porte : `id` (stable, dérivé du chemin/nom), `label` (nom de symbole), `file_path`, `span`
(`line_start/end`), `size` (métrique de taille), et des `links` (arêtes sortantes typées).

Les sept primitives canoniques : `assembly` (module/classe/fichier), `mechanism` (fonction/méthode), `loop` (boucle),
`branch` (conditionnelle), `call` (appel), `assign` (affectation), `data` (paramètre/retour/champ). La correspondance
arbre-sitter → primitive est la **table du §2**.

**Règle d'or de la normalisation :** une primitive = une unité de *sens*, pas un nœud syntaxique. Un `else if` se
normalise en un `branch` (pas deux) ; une fonction d'une ligne (`fn x() -> i32 { 1 }`) reste **un** `mechanism`, son
corps n'étant pas déplié tant qu'il n'y a ni boucle ni branche ni appel (élision — voir §3).

### Étage 3 — Mapping sémantique → `SceneProjection`
Chaque primitive `CodeIR` devient un **nœud de construction** du contrat de scène (§5) : soit un `IsoNode` (protocole
`ast.ts`, une mécanique décrite en données), soit une référence à une mécanique de la bibliothèque (`MechId`). C'est ici
que le **sens** déjà indexé dans `meaning.ts` (mots-clés FR/EN → mécanique, ex. « exécution parallèle » →
`parallel-lanes`) est réutilisé : le mapping sémantique choisit la forme qui *montre* la primitive, pas une icône.

Le résultat d'étage est un `SceneProjection` : un graphe acyclique de nœuds de scène, chaque nœud portant sa
**géométrie** (`IsoNode`), sa **teinte** (`Tone` de la palette), son **étiquette** (`label`), et ses **liaisons**
(`tube`/`cone` entre nœuds). Ce graphe n'est **pas encore disposé** : la disposition appartient au contrat 01.

### Étage 4 — Nœuds de scène → `SceneSpec` / `SceneStation`
Le `SceneProjection` est découpé en **postes** (`SceneStation`) selon la granularité voulue (un fichier = une scène
`compact`/`solo` ; un module = un poste sur une disposition `ring`/`stadium`). Chaque poste reçoit `mech` **ou** `ast`
(le `IsoNode` compilé par `astMechanism`). Le tout est passé à `defineScene`, qui **valide** (identifiants, budgets de
faces, composition) et construit la `MachineDef` prête à rendre.

---

## 2. Table de correspondance (nœud AST → forme mécanique)

La table est la **seule** source de vérité du mapping. Colonnes :
- **Primitive `CodeIR`** : la forme canonique (étage 2).
- **Source AST (tree-sitter / `ParsedFile`)** : d'où elle provient — `P` = déjà dans `ParsedFile`, `X` = extension
  contrôle/données à définir (non émise aujourd'hui, mais accessible via un `TreeCursor` complet).
- **Forme mécanique** : l'`IsoNode` (ou objet du catalogue `use`) qui la représente.
- **Geste** : mouvement (`motion`) et états au repos / au service.

| Primitive | Source AST | Forme mécanique (IsoNode / catalogue) | Geste & sens |
|---|---|---|---|
| `assembly` — module/classe/fichier | `structs` (P), `traits` (P), `enums` (P), `ModuleNode` | `group` avec `sockets`, socle `slab` graphite, ou `use: 'server'` / `'drawers'` (mécanique `drawers`) | conteneur ; tiroirs = ses membres, s'ouvrent au service |
| `mechanism` — fonction/méthode | `functions` (P), `impl_blocks` (P) | un poste entier (station) ; corps = `group` de pièces ; taille ∝ `complexity` | `pulse`/`breathe` au repos ; geste = « la fonction s'exécute » (le flux traverse) |
| `loop` — boucle (`for`/`while`) | `for_statement`, `while_expression` (X) | `ring` ou `torus` avec `motion: spin` (période = nombre d'itérations) ; `while` → anneau, `for` → `repeat` + `lathe` | rotation continue = répétition |
| `branch` — conditionnelle (`if`/`match`) | `if_statement`, `match_arm`, `case_clause`, `ternary_expression` (X) | aiguillage : un `tube` entrant qui se scinde en 2+ `cone`/`tube` sortants ; motif `parallel-lanes` réduit | le flux ne prend qu'une voie (l'autre reste sombre) |
| `call` — appel de fonction | `function_calls` (P, `confidence`/`reason`) | `tube` entre le mécanisme appelant et l'appelé ; épaisseur ∝ `confidence` ; externe → `use: 'arrow'` ou chaîne (`local-vault`) | un `pulse` parcourt le tube (geste) |
| `assign` — affectation | variable/`assignment` (X) | `tube` (tuyau) de la source vers la cible, `motion: slide` | le paquet glisse le long du tuyau |
| `data` — paramètre/retour/champ | `params`/`return_type` (P), `FieldNode` (P) | `puck`/`sphere` (réservoir), ou `use: 'document'`/`'chip'` ; retour = `use: 'flag'` | le retour hisse le drapeau au geste |
| `import` — dépendance externe | `imports` (P) | chaîne de maillons ou `use: 'arrow'` vers un `use: 'server'` externe | lien vers l'extérieur (coffre/local-vault) |
| `async`/`unsafe` — qualificatifs | `is_async`, `is_unsafe` (P) | `glow` + teinte dédiée (`sky` pour async, `amber`/`red` pour unsafe) | alerte visuelle permanente |

**Règle de teinte.** La teinte du poste (`tone`) est prise **uniquement** dans la palette `LAMP` (jamais de couleur
libre) ; `accent` reprend celle du poste. `visibility` (`Public`/`Private`/…) peut nuancer la matière (`steelL` public,
`satin` privé).

**Règle de taille.** La taille d'un `mechanism` est une fonction **bornée** de sa complexité cyclomatique :
`size = clamp(complexity, 1, K_max)` — au-delà d'un seuil, le mécanisme est **agrégé** (voir §3), jamais agrandi
indéfiniment.

---

## 3. Rester « instantané »

Trois leviers garantissent que la projection est directe et ne dégénère pas avec la taille du code.

### 3.1 Incrémentalité (re-projeter seulement ce qui a changé)
Le socle existe déjà : `ast_cache` (LRU clé `path:content_hash`, capacité 200) évite de re-parser les fichiers
inchangés. La projection ajoute **deux niveaux de cache en cascade**, chacun clé par le hash de son entrée :

1. `content_hash` (SHA-256 du fichier) → `ParsedFile` (cache existant, ne pas dupliquer).
2. `parse_hash` → `CodeIR` : si un fichier n'a pas changé, sa normalisation est rejouée depuis le cache, pas recalculée.
3. `ir_hash` → `SceneProjection` : seuls les nœuds dont le sous-graphe `CodeIR` a changé sont re-projetés.

Conséquence : une édition touchant une fonction re-projette **cette fonction et ses arêtes** (appels, appartenance au
module), pas le fichier entier, pas le projet. Les liaisons inter-fichiers (`function_calls` entre fichiers) ne sont
recalculées que si le `caller` ou le `callee` a changé.

### 3.2 Budgets de faces (plafond dur)
La projection **doit** tenir dans les budgets du contrat 01, qui sont déjà vérifiés par `defineScene` :
`SCENE_BUDGETS = { svgHero: 900, svgSolo: 200, lit: 4500 }`, et les bornes du protocole
`AST_LIMITS = { depth: 8, shapes: 160, size: [0.01, 6], path: 12 }`. La projection applique, **dans cet ordre** :

1. **Élision** : toute primitive dont la taille projetée est `< DETAIL (0.16)` passe au niveau de détail 2 (absente du
   SVG de repli, présente au WebGL). Un corps de fonction sans boucle/branche/appel est élidé à l'étage 2 (pas de nœuds).
2. **Agrégation** : un module dépassant `shapes: 160` replie ses mécanismes en **un** mécanisme `repeat` (une forme
   répétée sur `positions`), ou en un objet du catalogue (`use: 'drawers'` = un tout aux contenus divers).
3. **Décimation géométrique** : les segments (`seg()`) sont réduits au SVG de repli — c'est déjà le mécanisme du rendu
   (`lod 1` vs `lod 2`), la projection n'a qu'à respecter les drapeaux `detail`.

**Règle :** la projection ne doit jamais émettre un graphe qui force `defineScene` à lever une `SceneError` (budget
dépassé). Si le graphe est trop lourd, on **agrège** (on réduit le sens affiché), on ne refuse pas.

### 3.3 Budget de temps (passe unique, pas de solveur de layout)
La projection est **une passe descendante** (top-down) sur le `CodeIR`, sans boucle de relaxation. La disposition
(position des postes, angles, espacement) est **déléguée au contrat 01** (`layouts.ts`, `choreography.ts`), pas
recalculée ici : la projection fournit des nœuds + des liaisons, le contrat les pose. C'est ce qui rend la projection
« instantanée » : elle est en O(nœuds), le coût de layout étant déjà amorti et validé par `defineScene`.

---

## 4. Trois exemples canoniques

Les exemples montrent la **sortie de projection** (nœuds `IsoNode`/postes, sous forme de données descriptives), pas du
code. Les coordonnées sont dans le repère du poste (−y vers le lecteur, x vers la gauche, z vers le haut, socle en z=0,
empreinte ±1,4).

### 4.1 Une fonction simple
Source (Rust) : `fn clamp(x: f32, lo: f32, hi: f32) -> f32 { x.min(hi).max(lo) }`

- `ParsedFile` : un `FunctionNode` `clamp`, `params` [x, lo, hi], `return_type` `f32`, `complexity` = 1 (pas de branche).
- Normalisation : un `mechanism` (corps élidé : ni boucle, ni branche, ni appel) + trois `data` en entrée + un `data` en sortie.
- Projection (un poste, `ast`) :
  - `group` « clamp » : socle `slab` graphite.
  - trois réservoirs d'entrée : `puck` `[x, lo, hi]` alignés, teinte `accent`.
  - un réservoir de sortie : `puck` + `use: 'flag'` (le retour), `glow`, `motion: pulse`.
  - trois tuyaux entrée → corps : `tube`, `motion: slide` (flux de données).
- Geste (poste servi) : les trois `puck` glissent vers le corps, le drapeau se hisse (`use: 'flag'`, geste).

### 4.2 Un module
Source : un fichier `auth.rs` avec `struct User`, `fn login`, `fn logout`, `fn hash` (appelé par `login`).

- `ParsedFile` : `structs` [User], `functions` [login, logout, hash], `function_calls` [login → hash, confidence 0.85].
- Normalisation : un `assembly` (fichier) contenant trois `mechanism` + une arête `call` `login → hash`.
- Projection (scène `compact`, ou un poste `assembly` sur `ring`) :
  - `assembly` = `use: 'drawers'` (un classeur : le module) — tiroirs = ses fonctions ; **ou** un `group` socle + trois postes.
  - `login` et `hash` reliés par un `tube` (appel, épaisseur ∝ 0.85), `motion: pulse` sur le tube.
  - `logout` isolé (aucune arête) → mécanisme autonome.
  - `struct User` = `use: 'server'` ou `use: 'chip'` (le type), posé comme conteneur des mécanismes qui le touchent.
- Geste : les tiroirs du module s'ouvrent l'un après l'autre (mécanique `drawers`), le `pulse` parcourt `login → hash`.

### 4.3 Un flux de contrôle
Source (pseudo) : `fn process(list) { for item in list { if ok(item) { send(item) } } }`

- Extension contrôle/données (étage 2, passe `X`) : un `mechanism` `process`, un `loop` (le `for`), un `branch` (le
  `if`), un `call` `send`, et les `data` `item`.
- Projection (un poste) :
  - `mechanism` `process` = corps `slab`.
  - `loop` = `ring` (anneau) en rotation, `motion: spin`, période = nombre d'itérations.
  - `branch` = un `tube` entrant qui se scinde en **deux** `cone`/`tube` sortants (voie « ok » éclairée, voie « else »
    sombre) — motif `parallel-lanes` réduit à un aiguillage.
  - `call` `send` = `tube` vers un mécanisme cible, `pulse`.
  - `data` `item` = un `puck` qui parcourt l'anneau (`motion: path` sur les points du cycle).
- Geste : l'anneau tourne, le `puck` fait un tour, franchit l'aiguillage par la voie « ok », et le `pulse` part vers `send`.

---

## 5. Synergie avec le contrat de scène (contrat 01)

La projection AST est un **producteur** du contrat 01 ; elle ne réinvente aucune brique. Le contrat 01 = le couple
`scene.ts` (API `defineScene`/`SceneSpec`/`SceneStation`) + `ast.ts` (protocole `IsoNode` + `checkAst`) +
`catalog.ts` + `meaning.ts`/`mechanisms.ts`.

Les nœuds de projection AST **référencent** le contrat 01 de la façon suivante :

1. **Toute géométrie projetée est un `IsoNode`** (`ast.ts`) ou un objet du catalogue (`use: 'agent'|'server'|…`), jamais
   une primitive Three.js ad hoc. Un nœud de projection est donc sérialisable, validable (`checkAst`) et composable.
2. **Un mécanisme projeté est soit un `MechId` de la bibliothèque** (`drawers`, `parallel-lanes`, `dependency-graph`,
   …), **soit un arbre compilé** via `astMechanism(id, root, shows)`. La `SceneStation` accepte `mech` **ou** `ast`
   (exactement l'un des deux — vérifié par `checkSpec`).
3. **La teinte** est un `Tone` de la palette `LAMP` (pas de couleur libre) ; l'étiquette est une **clé i18n** (le nom de
   symbole mappé, jamais un texte libre).
4. **Les budgets** sont ceux du contrat : `SCENE_BUDGETS` (faces) et `AST_LIMITS` (profondeur/formes/tailles). La
   projection agrège avant de les dépasser (§3.2), pour que `defineScene` ne lève jamais de `SceneError` pour cause de
   budget.
5. **La disposition** (où poser les postes, l'ordre de construction `after`, la chorégraphie `build`) est choisie par le
   contrat 01 selon l'objectif d'affichage (une fonction = `solo`/`compact` ; un module = `ring`/`stadium`/`corners` ;
   un graphe de modules = `arch`/`wings`). La projection fournit les nœuds et les liaisons, le contrat les place.

**Contrat d'interface (résumé).** La projection expose : `project(file | module) → SceneProjection`, où
`SceneProjection` = liste de `ProjectedNode { iso: IsoNode | MechId, tone: Tone, label: i18nKey, links: [(from, to,
kind)] }`. Le contrat 01 consomme cette liste, la découpe en `SceneStation`, la valide et la rend. Aucun autre couplage.

---

## Résumé

La projection AST→scène est un pipeline à quatre étages purs et déterministes : (1) **parse** tree-sitter existant
(`ParsedFile`, niveau entité) ; (2) **normalisation** vers un vocabulaire mécanique canonique de sept primitives
(`assembly`, `mechanism`, `loop`, `branch`, `call`, `assign`, `data`) qui replie 18 langages sur un seul modèle ;
(3) **mapping sémantique** vers des `IsoNode`/`MechId` en réutilisant l'index de sens de `meaning.ts` ; (4) **nœuds de
scène** consommés par `defineScene`. La table de correspondance fixe une forme mécanique par primitive (fonction →
mécanisme, module → assemblage/classeur, boucle → anneau, branche → aiguillage, appel/affectation → tuyau, donnée →
réservoir). L'instantanéité repose sur trois leviers : incrémentalité par hash en cascade (le cache `ast_cache`
existant + deux caches de projection), budgets de faces durs (`SCENE_BUDGETS`, `AST_LIMITS`) avec élision/agrégation,
et passe unique sans solveur de layout (la disposition reste au contrat 01). Le contrat 01 est le seul consommateur :
chaque nœud projeté est un `IsoNode` validé par `checkAst`, dans la palette `LAMP`, étiqueté i18n, et tient les budgets.
Point d'attention relevé : `ParsedFile` est **entité-niveau** — les flux de contrôle/données sont à ajouter comme passe
optionnelle (`X`), que tree-sitter sait déjà produire (le calcul de complexité parcourt déjà tout l'arbre).
