# 05 — Orchestration de l'essaim (scène 3D produite par plusieurs agents en parallèle)

> **Périmètre.** Comment *plusieurs agents* produisent et améliorent une scène 3D en parallèle, et comment la
> projection AST→scène (spec 04) reste « instantanée » malgré la concurrence. Pas d'implémentation : uniquement le
> modèle de collaboration, la boucle de rétroaction, le budget de concurrence, la convergence et les garde-fous.
>
> **Sources lues.** Specs 01–04 (contrat de scène, géométrie, PBR, projection AST) ; `choreography.ts` (ordonnancement
> parallel/sequential/waves d'« escouades »), `live.ts` (scène vivante par *patchs* atomiques : `add/status/link/label/
> pulse`), `drive.ts`, `focus.ts` ; backend `prompt_sections.rs` (émission du bloc `iso-scene`, validateur miroir).
> Deux règles du graphe de connaissances servent d'ancrage : la **règle de cadence** (« nombre d'agents ≠ créneaux de
> compilation ») et la **RFC Équipe d'agents multi-moteurs en temps réel** (réclamation de fichiers, worktree par
> enfant, écriture refusée avec le nom du propriétaire).

---

## Idée directrice

La scène 3D n'est **pas un document partagé que les agents éditent ensemble** : c'est un **artefact dérivé**, recalculé
par une projection déterministe (spec 04) à partir d'unités de provenance qui, elles, ont chacune **un seul
propriétaire**. Tout le modèle d'orchestration découle de cette inversion :

- le **travail parallèle** se fait sur les *unités de provenance* (fichiers, nœuds nommés) — il est massivement
  parallélisable et sans conflit ;
- la **couture** (projection → fusion → validation → scène) est un **chemin court, sérialisé, déterministe** — il ne
  peut pas entrer en conflit parce qu'il ne fait que *lire* les unités et *écrire un unique état de scène*.

On retrouve exactement le partage que `live.ts` réalise déjà : des patchs atomiques appliqués par un seul point
d'entrée (`apply`), un lot invalide refusé en entier, la scène restant intacte. L'essaim **généralise** ce mécanisme à
plusieurs émetteurs au lieu d'un seul.

---

## 1. Modèle de collaboration : partitions étanches, un fichier / un propriétaire

### 1.1 Unité de provenance et partition

**Unité de provenance** = la plus petite part de scène qui a **exactement un propriétaire**. Deux familles, selon
l'origine de la scène :

| Famille | Unité de provenance | Contenu de scène dérivé | Règle de propriété |
|---|---|---|---|
| **Projection** (spec 04) | un **fichier** (ou module/package) | son sous-graphe `SceneProjection` (mécanismes, assemblages, liaisons) | l'agent qui **réclame le fichier** possède le sous-graphe |
| **Direction** (scène écrite à la main) | un **identifiant de nœud / de poste** (kebab, stable) | ce nœud et ses enfants | l'agent qui **réclame l'id** possède le sous-arbre |

Une **partition** est l'ensemble des unités de provenance détenues par un agent. La scène est l'**union disjointe** des
partitions : une partition est **étanche** si aucune unité n'y est partagée avec une autre.

**Règle cardinale « un fichier / un propriétaire ».** Une unité de provenance a **un seul propriétaire à la fois**.
Une écriture sur un fichier (ou un id de nœud) réclamé par un autre agent est **refusée avec le nom du propriétaire**
(RFC Équipe : la réclamation est posée dans le graphe, elle vaut verrou logique). Le conflit d'écriture est donc
**impossible par construction**, pas résolu après coup.

### 1.2 Les coutures — le seul endroit qui demande de la coordination

Les partitions sont étanches sur le *contenu*, mais elles se **touchent par les liaisons** : un `function_calls`
inter-fichiers (spec 04, arête `call`) produit un `tube` entre deux partitions, donc une arête de scène dont les deux
extrémités appartiennent à **deux propriétaires différents**. Les coutures obéissent à un arbitrage **déterministe** :

1. **L'arête sortante appartient au côté appelant** (le fichier qui émet l'appel possède le `tube`/`arrow` sortant) ;
   le côté appelé possède seulement la **pose** de son nœud cible.
2. Chaque extrémité est **épinglée par version** (cf. §4) : le tube référence l'id du nœud appelé + sa version, pas ses
   coordonnées. Si le nœud cible bouge (re-projection), le tube se **re-câble automatiquement** à la fusion, sans
   écriture croisée.
3. Le **décor partagé** (caméra, lumières, groupe racine, disposition, `layout`) a **un seul propriétaire désigné** :
   le parent/orchestrateur, ou un agent « propriétaire de scène ». Jamais écrit en concurrence.

### 1.3 Le graphe de dépendances `after` = le graphe de dépendances des tâches

Le champ `after` du contrat (dépendances entre postes, déjà vérifié sans cycle par `choreography.ts::findCycle`) est le
**miroir** du graphe de dépendances des tâches du plan PO. Une partition « dépend » d'une autre quand son contenu de
scène attend des postes construits ailleurs. Cette correspondance permet de réutiliser l'ordonnancement existant
(`planBuild` : parallel / sequential / waves) pour **visualiser** le vrai parallélisme de l'essaim : `build.agents`
(1–6) et `build.squad` (1–4) sont la *métaphore visuelle* des agents réels et de leurs escouades.

---

## 2. Boucle de rétroaction « instantanée » : invalidation ciblée, pas de rebuild

La spec 04 pose une cascade de caches à clé de hash : `content_hash → ParsedFile → CodeIR → SceneProjection`, plus le
cache de parse existant (`ast_cache`, LRU clé `path:content_hash`). L'essaim **se branche sur cette cascade** et ajoute
une couche de *publication* d'invalidations. La boucle est :

```
édition d'un fichier (un agent)
  → hash du fichier change
  → invalidation CIBLÉE : seuls les caches de CE fichier tombent (LRU)
  → re-projection de CE SEUL fichier (spec 04, O(taille du fichier), borné par AST_LIMITS)
  → émission d'un PATCH SET = diff des deux projections (ajout/retrait/changement de nœuds et de liaisons)
  → application ATOMIQUE par la couche de fusion (cf. §3)
  → mise à jour PARTIELLE du rendu (re-maillage des nœuds changés, ré-instanciation, re-cadrage `fit`)
```

### 2.1 Le delta est un *diff de deux projections pures*, jamais écrit à la main

Parce que la projection est **déterministe et pure** (spec 04, §1), le delta entre `project(v1)` et `project(v2)` est
**exact et minimal** : aucun agent ne calcule un patch à la main. Un agent *édite du code* (ou un nœud nommé) ; le moteur
**dérive** le patch. C'est ce qui garantit l'instantanéité : le coût est **O(unités changées)**, jamais O(scène), et il
n'y a **pas de rebuild complet**.

### 2.2 Unidirectionnalité = pas de boucle de réverbération

La boucle est **unidirectionnelle** : `fichiers → scène`, jamais l'inverse. La scène n'écrit jamais dans les fichiers,
et une re-projection n'est déclenchée que par un **changement de hash de contenu**, pas par un changement de scène.
Deux agents qui se regardent ne peuvent donc pas s'envoyer des mises à jour en boucle (cf. §5.4).

### 2.3 Coalescence et rafale

Plusieurs éditions dans une fenêtre courte sont **coalescées** (une seule re-projection par fichier et par fenêtre, par
ex. 100 ms) : c'est le même principe que la limite de débit de la messagerie d'équipe (10 messages/min/paire). Un
fichier édité N fois en rafale ne coûte qu'**une** re-projection, celle de son état final.

---

## 3. Budget de concurrence : agents ≠ créneaux de compilation

### 3.1 La règle mesurée

La **règle de cadence** du graphe établit : *« nombre d'agents » n'est pas « créneaux de compilation »*. Les agents du
harnais natif sont du **calcul distant** : dix agents ne coûtent localement presque rien **sauf quand ils compilent** ;
le vrai mur local est la **RAM/swap**, pas le CPU ; le **gouverneur** (3 créneaux, 5 jobs, `CARGO_TARGET_DIR` partagé)
**est** la contre-pression sûre : on lance **beaucoup** d'agents, ils font la queue sur les créneaux pendant qu'ils
lisent/conçoivent. Le goulot n'est pas le nombre d'agents, c'est la **taille et l'ambiguïté** de la tâche.

### 3.2 Transposition à la projection de scène : deux files distinctes

La projection AST→scène **n'est pas** une compilation cargo : c'est un *parse tree-sitter + un mapping pur* (spec 04),
sans linking, sans artefacts, bien moins coûteux en RAM. Il faut donc distinguer **deux files de sérialisation** :

| File | Ressource sérialisée | Cardinalité | Coût | Goulet ? |
|---|---|---|---|---|
| **Compilation** (cargo) | créneaux du gouverneur | 3 créneaux / 5 jobs | ~2–6 Go par build | oui (RAM/swap) |
| **Fusion de scène** (merge) | l'état de scène unique | **1 écrivain** | O(unités changées) par lot | non (court) |
| **Projection** (parse+map) | aucune (parallélisable par fichier) | M travailleurs | O(taille du fichier) | non |

**Règles.**

1. **Lancer beaucoup d'agents** (jusqu'à une partition par agent + 1 propriétaire de scène), sans plafond couplé à la
   compilation. Le parallélisme réel de l'essaim est borné par le **nombre de partitions**, pas par les créneaux.
2. **Un seul écrivain de fusion.** L'application des patchs et la validation globale sont **sérialisées** — c'est le
   seul point qui mute l'état partagé, et il est O(changé), donc jamais le goulot.
3. **La projection ne consomme pas les créneaux cargo.** Elle a sa propre petite file (M travailleurs), parce qu'elle
   est orthogonale à la compilation : un agent peut éditer du code *et* voir sa scène se mettre à jour pendant que le
   build cargo attend un créneau.
4. **Ne jamais contourner le gouverneur.** Si la projection devient elle-même un mur (projet énorme), on lui applique
   le **même patron** (M créneaux de projection + 1 fusion), on ne la parallélise pas naïvement sur l'état partagé.

### 3.3 Asymétrie tête/queue — pourquoi ça reste instantané

La **tête** (édition, conception, latence des agents) est lente et **massivement parallèle** ; la **queue**
(projection + fusion + re-cadrage) est rapide et **sérialisée mais O(changé)**. L'instantanéité est préservée parce que
la queue sérialisée est **négligeable** devant la tête parallèle. Le budget se lit donc : *beaucoup d'agents écrivent
des unités disjointes ; un unique point de fusion recoud en O(changé)*.

---

## 4. Convergence : pas de « dernier écrit gagne » sans contrôle

### 4.1 Deux invariants rendent la convergence quasi gratuite pour le contenu projeté

1. **Déterminisme** (spec 04) : même contenu de fichier → même sous-graphe projeté. Deux agents qui projettent
   (redondamment) le même fichier produisent **la même sortie** ; appliquer l'un ou l'autre donne la même scène.
2. **Idempotence** : ré-appliquer un patch (ou re-projeter un fichier inchangé, hash identique) est un **no-op**. Le
   travail dupliqué est donc **inoffensif**, pas destructeur.

Conséquence : pour la projection, il n'y a **pas de course** à arbitrer — le résultat final ne dépend **pas** de l'ordre
d'arrivée des agents. C'est la différence fondamentale avec un document partagé.

### 4.2 Pour le contenu « dirigé » (nœuds écrits à la main), on ajoute version + CAS

Les nœuds nommés peuvent être réécrits, donc une course y est possible. On la ferme par **compare-and-swap** :

- chaque `id` de nœud porte un **numéro de version monotone** ;
- un patch porte la **version de base** qu'il a lue ;
- à la fusion, si la version courante a avancé (un autre patch accepté entre-temps), le patch est **refusé** avec le
  diff, et le propriétaire doit **rebaser**.

**Règle : conflit = refus, jamais fusion silencieuse.** Deux patchs qui touchent le même nœud avec des bases
différentes → **un** est refusé, le propriétaire réconcilie. La couche de fusion ne fabrique jamais d'union
approximative (pas de « dernier écrit gagne » sans contrôle).

### 4.3 Critères d'acceptation d'une partition (définition de « fini »)

Une partition n'est **jamais** déclarée finie isolément. Les critères, dans l'ordre :

1. **Validation locale** : le sous-graphe projeté passe `checkAst` / `checkSpec` (le validateur du contrat 01), sans
   `SceneError` de budget (`SCENE_BUDGETS`, `AST_LIMITS`) ;
2. **Coutures résolues** : chaque liaison sortante référence un nœud existant, avec sa version épinglée ;
3. **Validation globale** : la scène *entière* (toutes partitions fusionnées) passe `defineScene` — identifiants uniques,
   graphe acyclique, références résolues, budgets totaux ;
4. **Invariants de composition** (spec 01) : pas de cycle de `parent`, `after` sans cycle, bornes numériques respectées.

L'**acceptation** est un acte du **parent/orchestrateur** (l'accept gate) : il exécute le validateur global sur l'état
fusionné après chaque lot accepté et publie le verdict. Les agents **convergent** vers « la scène est valide et chaque
partition est acceptée » — c'est l'équivalent, côté scène, du « plan completed » côté tâches.

### 4.4 Le parent reste l'orchestrateur

Conformément à la RFC Équipe : le parent **crée les membres, peut les arrêter, reçoit les résultats** ; les enfants se
parlent sans passer par lui, mais la **couture finale** (fusion + validation + publication) lui revient. Un essaim libre
sans parent est **écarté** (perte de contrôle, coût non borné, aucun propriétaire du résultat).

---

## 5. Points d'échec et garde-fous

### 5.1 Agent mort / partition orpheline

- **Bail sur réclamation** : une réclamation de fichier/nœud a un **lease** (renouvelé par battement de cœur, ou lié à
  la session). À expiration (session morte), la réclamation est **libérée**, la partition repasse « sans propriétaire »,
  le parent peut la réassigner ou rabattre le travail partiel.
- **Un chantier inachevé ne bloque jamais la scène** : réutilisation directe des statuts `live.ts`
  (`planned/building/done/failed`). Le contenu déjà projeté par la partition reste (ce sont des sous-graphes *valides*),
  et les partitions non terminées s'affichent en fil de fer / `planned` ; « un chantier long reste un chantier »
  (`live.ts` : la montée ralentit, n'atteint jamais le sommet). Le partiel est **visible et non bloquant**.

### 5.2 Livrable partiel — atomicité de lot

Un lot de patchs est **atomique** (tout-ou-rien), exactement comme `live.ts::apply` : « un lot de patchs invalide est
refusé EN ENTIER, avec ses raisons, et la scène reste telle quelle ». Il n'existe donc **jamais** de partition
à moitié appliquée. Si un lot est invalide, il est refusé et le propriétaire est notifié.

### 5.3 Divergence de contrat

- **Une seule source de vérité du contrat** : le validateur de scène (spec 01), **miroir backend↔frontend**
  (`iso_scene_problems` / futur `scene3d_problems`, avec test de concordance — `prompt_sections.rs`). Un agent qui
  émet un bloc hors contrat est **refusé à la frontière** : la divergence ne peut pas entrer dans la scène.
- **Épinglage de version du contrat** : chaque sortie de partition est **taggée** avec la version du contrat contre
  laquelle elle a été produite. Si le contrat évolue (rupture), le tag ne correspond plus et la partition est
  **re-projetée / refusée** jusqu'à ce que son propriétaire la mette à jour. Deux agents ne peuvent pas travailler sous
  deux versions du contrat sans le savoir.
- **La règle « un fichier / un propriétaire » est elle-même un garde-fou** : deux écrivains divergents sur une même
  unité sont impossibles par construction.

### 5.4 Boucle de réverbération

Deux agents qui réagissent l'un à l'autre en boucle : le garde-fou est l'**unidirectionnalité** de la boucle
(§2.2) — la scène n'écrit pas dans les fichiers, et la re-projection ne se déclenche que sur un **changement de hash** —
plus la **coalescence** (§2.3) et la **limite de débit** (patron de la RFC : 10 messages/min/paire). Aucun cycle
fichier↔scène n'existe.

### 5.5 Dépassement de budget de faces

La projection **agrège avant** de dépasser les budgets (spec 04 §3.2 : élision, agrégation, décimation). La couche de
fusion **re-vérifie** après assemblage et peut forcer une agrégation supplémentaire. **Règle :** la scène ne lève
**jamais** de `SceneError` pour cause de budget à cause de l'essaim — on réduit le sens affiché, on ne refuse pas.

### 5.6 Sécurité

Un agent n'a **jamais plus de droits que le parent** ; un bloc de scène est une **donnée**, jamais une instruction
(spec 01 : champs inconnus refusés, URLs `https:`/`data:` uniquement, data-URI borné). La messagerie d'équipe reste une
**information**, jamais une autorisation.

---

## Résumé (≤ 10 lignes)

La scène 3D est un **artefact dérivé**, pas un document partagé : chaque **unité de provenance** (fichier en
projection, id de nœud en écriture directe) a **un seul propriétaire** (« un fichier / un propriétaire »), donc aucun
conflit d'écriture n'est possible — seules les **coutures** (liaisons inter-partitions) sont arbitrées de façon
déterministe. La boucle « instantanée » est un **diff de deux projections pures** : édition → invalidation ciblée par
hash → re-projection O(fichier changé) → patch atomique → mise à jour partielle, **jamais de rebuild**. Le budget de
concurrence suit la règle mesurée **« nombre d'agents ≠ créneaux de compilation »** : beaucoup d'agents (un par
partition), mais **un seul écrivain de fusion** et la projection **hors créneaux cargo** (parse+mapping pur). La
convergence repose sur le **déterminisme + l'idempotence** (le résultat ne dépend pas de l'ordre d'arrivée) ; pour les
nœuds écrits à la main, **version + compare-and-swap**, conflit = refus, jamais fusion silencieuse. L'acceptation est
**globale** (validateur du contrat sur la scène entière) et détenue par le **parent orchestrateur**. Les garde-fous :
bail sur réclamation (agent mort), atomicité de lot (livrable partiel), validateur miroir + épinglage de version
(divergence de contrat), unidirectionnalité + coalescence (réverbération), agrégation (budget).
