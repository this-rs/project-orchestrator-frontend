# Contrat de scène 3D générale — spécification

> Statut : proposition d'architecture (spec uniquement, aucune implémentation).
> Périmètre : le **modèle de données / format** que le modèle émet pour décrire une scène 3D.
> Objectif : remplacer le moteur `three-iso` (catalogue figé de primitives + style isométrique) par un moteur
> général capable de représenter n'importe quoi — maillages arbitraires, matériaux PBR, textures, caméra libre —
> **sans casser** le bloc `iso-scene` actuel (`mech` + `ast`).

---

## 0. Objet et principes

Le contrat actuel est un **catalogue fermé** : une scène est une `layout` + des `stations`, chaque station étant soit
une `mech` (mécanique figée : `drawers`, `dependency-graph`, …) soit un `ast` (arbre de primitives : `slab`, `puck`,
`sphere`, `tube`, `ring`, `cone`, `lathe`, `capsule`, `torus`, `group`, `repeat`, `use`). Tout ce qui n'est pas dans
la liste est refusé (voir `scene.ts` `checkSpec`, `ast.ts` `checkAst`, et le miroir backend
`iso_scene_problems` de `prompt_sections.rs`).

Le nouveau contrat conserve **exactement** ce vocabulaire comme sous-ensemble, et ajoute des capacités par
**couches opt-in** :

1. **Un graphe de nœuds** (liste plate `nodes` + liens `parent`) au lieu du seul arbre `ast` ;
2. **Des maillages inline** (`mesh` : `positions`/`normals`/`uvs`/`indices`) ;
3. **Des matériaux PBR** nommés (`materials`) ;
4. **Des textures** (`textures`) — image (URL/data URI) ou procédurales ;
5. **Une caméra libre** (`camera`) et **des lumières** (`lights`) ;
6. **Des nœuds de projection AST** (`mesh`, `instance`, `asset`) qui « baissent » (lower) l'ancien arbre dans le
   graphe en conservant budgets, LOD et couches de construction.

Principe directeur : **une scène est soit legacy (v1), soit générale (v2), jamais un mélange**. Les deux passent par
le même validateur (le validateur v2 est un sur-ensemble du validateur v1).

---

## 1. Le contrat racine — versionnage et discriminateur

Une scène est un **objet JSON** (jamais un tableau, jamais un scalaire). La racine porte un champ de version et un
discriminateur de mode :

| Champ | Type | Présence | Règle |
|---|---|---|---|
| `version` | `"1"` \| `"2"` | optionnelle | Si absente, inférée depuis le contenu (voir ci-dessous). |
| `title` | string | optionnelle | ≤ 120 caractères (partagé v1/v2). |
| `caption` | string | optionnelle | ≤ 300 caractères (partagé v1/v2). |
| champs v1 | — | voir §4 | `layout`, `stations`, `angles`, `home`, `stepSeconds`, `focal`, `build`, `ast`, `tone`, `label`. |
| champs v2 | — | voir §2 | `camera`, `lights`, `textures`, `materials`, `assets`, `nodes`. |

**Discrimination (quand `version` est absente) :**
- présence d'au moins un de `stations`, `ast`, `mech`, `layout`, `angles`, `home`, `stepSeconds`, `build` → **v1** ;
- sinon, présence d'au moins un de `nodes`, `assets`, `camera`, `lights`, `materials`, `textures` → **v2** ;
- ni l'un ni l'autre → refus (`a scene needs stations/ast or nodes`) ;
- **mélange v1 + v2 → refus** (un seul champ interdit suffit), *exception* : `title` et `caption` sont partagés.

Un champ **inconnu** refuse la scène (règle héritée de v1 : « an unknown field refuses the scene »). Cette règle est
conservée en v2 pour que les fautes de frappe soient visibles, mais la liste des clés connues s'étend.

---

## 2. Les types de nœuds

### 2.1 Nœuds de scène (v2) — graphe

`nodes` est une liste plate d'objets, chacun décrivant un nœud. Un nœud référence son parent par `parent`
(identifiant), ce qui forme un graphe **acyclique** (les cycles sont refusés, comme les `after` en v1).

```jsonc
{
  "id": "roue-avant",                 // identifiant unique dans la scène (kebab ou pointé)
  "parent": "châssis",                // id d'un autre nœud, ou absent = racine
  "position": [1.2, 0, 0.4],          // [x,y,z], défaut [0,0,0]
  "rotation": [0, 90, 0],             // degrés XYZ (ordre x→y→z), défaut [0,0,0]
  // OU "quaternion": [x,y,z,w]       // exclusif avec rotation, normalisé
  "scale": [1, 1, 1],                 // [x,y,z] ou scalaire, défaut [1,1,1]

  // CONTENU — exactement un des trois :
  "primitive": { "kind": "slab", "size": [1,1,1] },  // → réutilise les kinds v1 (§2.7)
  "mesh":     { "positions": [...], "indices": [...] },  // → §2.2
  "instance": { "asset": "roue", "material": "metal" },  // → §2.7

  "material": "metal",                // surcharge le matériau du contenu (ref §2.3)
  "visible": true,                    // défaut true
  "castsShadow": true,                // défaut true
  "receivesShadow": true              // défaut true
}
```

> L'ancien arbre `ast` reste utilisable **tel quel** : les champs `kind`, `at`, `rot`, `children`, `sockets`,
> `motion`, `tone`, `mat`, `glow`, `detail` ne changent pas (voir §2.7). Le graphe `nodes` est une *alternative*
> plus générale, pas un remplacement obligatoire.

### 2.2 Maillage inline — `mesh`

Le cœur de la généralisation : la géométrie est donnée **inline**, sans passer par un catalogue.

```jsonc
{
  "mesh": {
    "positions": [ -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, /* … N×3 flottants */ ],
    "normals":   [ /* optionnel : N×3, défaut = normales plates calculées */ ],
    "uvs":       [ /* optionnel : N×2, défaut = [0,0] */ ],
    "indices":   [ 0,1,2, 0,2,3 /* M×3 entiers, triangles uniquement */ ],
    "winding":   "ccw",               // "ccw" (défaut) | "cw"
    "material":  "metal"              // ref matériau (§2.3), sinon défaut
  }
}
```

- `positions` : tableau plat de flottants, longueur **multiple de 3** (= N sommets). Composantes ∈ `[-1000, 1000]`.
- `indices` : tableau plat d'entiers `uint32`, longueur **multiple de 3** (triangles), chaque valeur `< N`.
- `normals` : si présent, **longueur == `positions`** (3 par sommet), composantes ∈ `[-1, 1]`.
- `uvs` : si présent, **longueur == N × 2**, composantes ∈ `[-64, 64]` (le tuilage `repeat` est permis).
- `winding` absent ⇒ `ccw` (cohérent avec le repère v1 : x gauche, −y lecteur, z haut).

Bornes exactes : §3.

### 2.3 Matériau PBR — `material`

`materials` est une liste de matériaux **nommés** ; les nœuds et maillages y font référence par `id`.

```jsonc
{
  "id": "metal",
  "baseColor": "#c89a4a",            // hex "#rrggbb" | "#rrggbbaa" | [r,g,b] | [r,g,b,a] (0..1)
  "baseColorTexture": "rouille",     // ref texture (§2.4), sinon baseColor
  "metallic": 0.9,                   // [0,1], défaut 0
  "roughness": 0.35,                 // [0,1], défaut 0.5
  "emissive": "#000000",             // couleur (comme baseColor), défaut noir
  "emissiveIntensity": 1,            // [0,64], défaut 1
  "opacity": 1,                      // [0,1], défaut 1
  "alphaCutoff": 0.5,                // [0,1], défaut 0.5
  "doubleSided": false,              // défaut false
  "normalMap": "bosse",              // ref texture, optionnel
  "metallicRoughnessTexture": null,  // ref texture, optionnel
  "occlusionTexture": null,          // ref texture, optionnel
  "ior": 1.5                         // [1,3], défaut 1.5, optionnel
}
```

> `baseColor` accepte une couleur **libre** (hex ou tableau) — c'est la rupture voulue avec la palette fermée
> `LAMP`/`MAT`. La palette reste disponible en v1, et en v2 via des matériaux pré-enregistrés portant ces noms
> (voir §4).

### 2.4 Texture — `texture`

`textures` est une liste de textures nommées. Deux familles :

```jsonc
// image
{ "id": "rouille", "kind": "image", "image": {
    "url": "https://cdn.example.org/rouille.png",   // https ou data:image/… ; ≤ 2048 caractères
    "wrapS": "repeat", "wrapT": "repeat",           // repeat | clamp | mirror
    "minFilter": "linear", "magFilter": "linear",   // nearest | linear
    "flipY": false
} }

// procédurale (repli léger, sans téléchargement)
{ "id": "checker", "kind": "procedural", "procedural": {
    "type": "checker",                 // checker | solid | gradient
    "colorA": "#dfe3ee", "colorB": "#1b1e2b",
    "scale": 8                          // entiers, répétitions par unité [1,64]
} }
```

- `url` : schéma **`https:`** ou **`data:image/…`** uniquement (`javascript:`, `file:`, `http:` refusés) ;
  longueur ≤ 2048. Une `data:` URI est limitée à **512 Kio décodés** (≈ 700 000 caractères base64).
- Dimensions (si déclarées ou déchiffrables) : **≤ 4096 × 4096** par côté.
- `procedural.solid.color`, `gradient` : couleurs hex uniquement ; `scale` entier ∈ `[1,64]`.

### 2.5 Caméra — `camera`

Au plus **une** caméra. Elle remplace la projection isométrique fixe de v1 (`focal`).

```jsonc
// perspective (défaut)
{ "kind": "perspective",
  "position": [3.2, -2.6, 2.4],   // [x,y,z] ∈ [-1000,1000]
  "target":   [0, 0, 0.4],        // point visé
  "up":       [0, 0, 1],          // défaut [0,0,1]
  "fov": 42,                      // degrés [1,120]
  "near": 0.1,                    // (0, 10000]
  "far":  100 }                   // > near, ≤ 100000

// orthographique
{ "kind": "orthographic",
  "zoom": 1,                      // (0,1000] — OU left/right/top/bottom finis (right>left, top>bottom)
  "position": [0, 0, 10], "target": [0,0,0],
  "near": 0.1, "far": 100 }
```

### 2.6 Lumières — `lights`

Liste ≤ 16, chacune avec `kind` :

| kind | champs | bornes |
|---|---|---|
| `ambient` | `color`, `intensity` | intensity ∈ [0,100] |
| `directional` | `color`, `intensity`, `direction` [x,y,z] non nul | idem |
| `point` | `color`, `intensity`, `position`, `distance`, `decay` | distance ∈ [0,10000], decay ∈ [0,4] |

`color` : hex ou tableau (comme `baseColor`). Défaut : lumière blanche, intensity 1.

### 2.7 Nœuds de projection AST (lowering)

L'ancien protocole `ast.ts` est **conservé intégralement** : les kinds `slab`, `puck`, `sphere`, `tube`, `ring`,
`cone`, `lathe`, `capsule`, `torus`, `group`, `repeat`, `use` et les champs `name`, `at`, `rot`, `mat`, `tone`,
`glow`, `motion`, `detail` restent valides avec les **mêmes bornes** (`AST_LIMITS`). Ce sont les « primitives » d'un
nœud v2 (`primitive`), et ils continuent d'être compilés par le même pipeline (pièces nommées par chemin, LOD déduit
via `DETAIL`, couches de construction).

Trois nouveaux kinds v2 sont des **projections** de ce pipeline :

- **`mesh`** — une feuille de géométrie brute. Projetée comme une pièce unique (compte pour **1 shape** dans le
  budget), **toujours LOD 2** (rendu éclairé uniquement, jamais au SVG de repli) sauf si `detail: false` et qu'une
  boîte englobante est fournie. Son coût réel est compté en **triangles** (§3).
- **`instance`** — généralise `use` : `{ asset, material?, scale? }`. Référence un **asset** (objet du catalogue v1
  `agent`, `screen`, … ; mécanique `mech:<id>` ; ou un `asset` déclaré en v2). Compte comme le sous-arbre référencé
  (déplié une fois).
- **`asset`** — déclaration nommée de géométrie réutilisable au niveau scène (`assets`), la forme générale des
  objets du catalogue : `{ "id": "roue", "node": { "mesh": { … } } }`. Validée une seule fois, puis instanciée.

**Table de projection (legacy → général) :**

| v1 (`iso-scene`) | v2 | règle |
|---|---|---|
| `layout` + `stations` | groupe racine `stations` + nœuds placés par la disposition | mêmes plages `STATION_RANGE` |
| `mech` (`id`) | `instance: { "asset": "mech:<id>" }` | mécanique figée conservée comme asset |
| `ast` (arbre) | sous-graphe de nœuds (`primitive`) | `AST_LIMITS` inchangés |
| `tone` (`LAMP`) | couleur libre / matériau | palette conservée en v1 |
| `mat` (9 `MAT`) | `material` PBR pré-enregistré portant le même nom | mapping 1:1 |
| `use` (`ref`) | `instance: { "asset": ref }` | `CATALOG` conservé |
| `group`/`children` | nœud `group` + enfants | identique |
| `repeat` | nœud `repeat` (shape comptée une fois) | identique |
| `motion` | `motion` sur le nœud | identique (spin/bob/slide/pulse/orbit/path) |

---

## 3. Règles de validation et bornes exactes

### 3.1 Bornes v1 (legacy, **inchangées** — reprises telles quelles)

| Domaine | Constante | Valeur |
|---|---|---|
| Postes par layout | `STATION_RANGE` | ring[3,12], stadium[4,12], arch[3,9], wings[2,10], corners[4,12], solo[1,1], compact[1,12], phone[2,12] |
| Profondeur d'arbre | `AST_LIMITS.depth` | 8 |
| Formes | `AST_LIMITS.shapes` | 160 |
| Taille | `AST_LIMITS.size` | [0.01, 6] |
| Points de `path` | `AST_LIMITS.path` | 2..12 |
| Seuil LOD | `DETAIL` | 0.16 |
| Budgets faces | `SCENE_BUDGETS` | svgHero 900, svgSolo 200, lit 4500 |
| Libellé | `label` | clé i18n, ≤ 60 caractères |
| `focal` | — | [0, 0.25] |
| `stepSeconds` | — | [0.6, 10] |
| `build` | — | mode ∈ parallel/sequential/waves ; agents [1,6] ; squad [1,4] ; durationMs [1500,12000] |
| `angles` | — | anneau uniquement, un par poste |
| `home` | — | [0, stations−1] |
| Teintes | `LAMP` | green, indigo, amber, red, violet, sky |
| Matières | `MAT` (ast) | porcelain, satin, graphite, steel, steelL, brass, brassL, copper, dark |
| Mécaniques | `MECHANISMS` | drawers, dependency-graph, parallel-lanes, knowledge-graph, local-vault, skill-cartridge, stair-procedure, consent-gate, model-selector, reach-devices |
| Objets | `CATALOG` | agent, screen, chip, flag, arrow, server, document, node, step |

### 3.2 Bornes v2 (général)

**Scène :**

| Constante | Valeur |
|---|---|
| `version` | `"1"` \| `"2"` |
| `title` / `caption` | ≤ 120 / ≤ 300 caractères |
| `MAX_NODES` | 512 |
| `MAX_DEPTH` (graphe) | 32 |
| `MAX_ASSETS` | 256 |
| `MAX_MATERIALS` | 64 |
| `MAX_TEXTURES` | 32 |
| `MAX_LIGHTS` | 16 |
| `MAX_CAMERAS` | 1 |
| `MAX_MESHES` | 256 |

**Maillage :**

| Constante | Valeur |
|---|---|
| `MAX_VERTICES` (par mesh) | 65 536 (positions ≤ 196 608 flottants) |
| `MAX_TRIANGLES` (par mesh) | 131 072 (indices ≤ 393 216 entiers) |
| `MAX_VERTICES_TOTAL` | 1 048 576 |
| `MAX_TRIANGLES_TOTAL` | 2 097 152 |
| composantes `positions` | [-1000, 1000] |
| composantes `normals` | [-1, 1] |
| composantes `uvs` | [-64, 64] |
| `indices` | entiers, `< vertexCount`, longueur % 3 == 0 |

**Transformations :**

| Champ | Bornes |
|---|---|
| `position` | [-1000, 1000] par composante |
| `rotation` | [-360, 360] degrés par composante |
| `quaternion` | normalisé (‖q‖ = 1 ± 1e-4), exclusif avec `rotation` |
| `scale` | [1e-4, 1000] par composante |

**Matériau / texture / caméra / lumière :** voir les plages notées en §2.3, §2.4, §2.5, §2.6.

### 3.3 Ordre des contrôles (v2)

1. **Racine objet** + `version` valide (ou inférée) + **aucun champ inconnu**.
2. **Discriminateur** : refus du mélange v1/v2 (hors `title`/`caption`).
3. **Identifiants uniques** par espace de noms : nœuds, assets, matériaux, textures (regex kebab/pointé
   `^[a-z0-9]+(-[a-z0-9]+)*$` ou chemin pointé, ≤ 64 caractères).
4. **Graphe acyclique** : pas de cycle de `parent` (équivalent v1 du contrôle de cycle des `after`).
5. **Bornes numériques** ci-dessus, champ par champ.
6. **Références résolues** : tout `material`/`baseColorTexture`/`normalMap`/`instance.asset` pointe un id déclaré.
7. **Budgets de faces** : en v2, le budget lit `SCENE_BUDGETS.lit` (4500) est relevé au niveau du maillage :
   **1 shape = 1 mesh**, et le total de triangles ≤ `MAX_TRIANGLES_TOTAL`. Le SVG de repli ne rend que les
   primitives v1 (jamais les `mesh`) ; une scène 100 % `mesh` n'a pas de repli SVG (dégradé en image de rendu).

---

## 4. Chemin de migration depuis `iso-scene`

**Tiers 1 — Pass-through (zéro effort).** Les blocs `iso-scene` existants ne changent pas : le discriminateur les
classe en v1 et le rendu passe par l'ancien chemin `three-iso`. Aucune migration requise, le validateur v1
(`iso_scene_problems` côté backend) reste inchangé et continue de les accepter.

**Tiers 2 — Montée de clôture (fence).** Renommer la clôture `iso-scene` → `scene3d` et ajouter `"version": "1"`.
Le corps JSON est strictement identique. Le moteur général rend le même résultat via sa couche de compatibilité.

Avant (valide) :
```json
{"title":"Release","stations":[
 {"mech":"dependency-graph","tone":"violet","label":"Plan"},
 {"mech":"parallel-lanes","tone":"sky","label":"Build","after":[0]},
 {"ast":{"kind":"use","ref":"flag"},"tone":"green","label":"Ship","after":[1]}],
"build":{"mode":"sequential"}}
```
Après (valide, identique au rendu) :
```json
{"version":"1","title":"Release","stations":[
 {"mech":"dependency-graph","tone":"violet","label":"Plan"},
 {"mech":"parallel-lanes","tone":"sky","label":"Build","after":[0]},
 {"ast":{"kind":"use","ref":"flag"},"tone":"green","label":"Ship","after":[1]}],
"build":{"mode":"sequential"}}
```

**Tiers 3 — Adoption de capacité (opt-in, incrémental).** Une scène v2 peut ajouter, sans abandonner les
`stations`/`ast` : d'abord une `camera` (perspective libre à la place du `focal`), puis des `materials`/`textures`
référencés par `material` sur les primitives, enfin des nœuds `mesh` aux côtés des `ast`. La règle de **non-mélange**
porte sur les *familles* de champs, pas sur l'adoption progressive : `nodes` + `assets` + `camera` + `materials` +
`textures` + `lights` coexistent librement **entre elles** (c'est le mode v2 complet) ; elles ne coexistent pas avec
`stations`/`ast`/`mech`/`layout` (mode v1).

**Règle backend.** `prompt_sections.rs` garde `iso_scene_problems` (v1) et ajoute `scene3d_problems` (v2, qui appelle
le même cœur v1 pour toute portion `stations`/`ast`). Le test
`the_iso_scene_section_matches_the_frontend_contract` reste vert ; un nouveau test miroir vérifie la clôture `scene3d`
et l'exemple v2. Le vocabulaire enseigné au modèle est étendu : `mesh`, `material`, `texture`, `camera`, `lights`,
`nodes`, `assets`, `instance`.

**Conservation des invariants v1 en v2 :** un seul `mech` **ou** un seul `ast` par station (jamais les deux), pas de
cycle de dépendances, tailles/vecteurs bornés, `label` ≤ 60 caractères, budgets de faces — toutes ces règles restent
vraies sur les portions legacy d'une scène.

---

## 5. Exemple de scène complète et valide

Scène v2 : un sol texturé (maillage inline quad + texture procédurale) et un cube métallique PBR (maillage inline),
caméra perspective libre, deux lumières.

```json
{
  "version": "2",
  "title": "Plan métallique texturé",
  "camera": {
    "kind": "perspective",
    "position": [3.2, -2.6, 2.4],
    "target": [0, 0, 0.4],
    "fov": 42,
    "near": 0.1,
    "far": 100
  },
  "lights": [
    { "kind": "directional", "color": "#ffffff", "intensity": 3, "direction": [0.6, -1, 0.8] },
    { "kind": "ambient", "color": "#3a4055", "intensity": 0.4 }
  ],
  "textures": [
    {
      "id": "checker",
      "kind": "procedural",
      "procedural": { "type": "checker", "colorA": "#dfe3ee", "colorB": "#1b1e2b", "scale": 8 }
    }
  ],
  "materials": [
    { "id": "metal", "baseColor": "#c89a4a", "metallic": 0.9, "roughness": 0.35 },
    { "id": "sol", "baseColor": "#ffffff", "baseColorTexture": "checker", "metallic": 0, "roughness": 0.8 }
  ],
  "nodes": [
    {
      "id": "dalle",
      "mesh": {
        "positions": [-2, 0, -2,  2, 0, -2,  2, 0, 2,  -2, 0, 2],
        "uvs":       [0, 0,  1, 0,  1, 1,  0, 1],
        "indices":   [0, 1, 2,  0, 2, 3]
      },
      "material": "sol"
    },
    {
      "id": "cube",
      "position": [0, 0, 0.6],
      "mesh": {
        "positions": [
          -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
          -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5
        ],
        "uvs": [0, 0,  1, 0,  1, 1,  0, 1,  0, 0,  1, 0,  1, 1,  0, 1],
        "indices": [
          4, 5, 6,   4, 6, 7,
          1, 0, 3,   1, 3, 2,
          5, 1, 2,   5, 2, 6,
          0, 4, 7,   0, 7, 3,
          7, 6, 2,   7, 2, 3,
          0, 1, 5,   0, 5, 4
        ]
      },
      "material": "metal"
    }
  ]
}
```

Points de contrôle vérifiés par le validateur v2 sur cet exemple :
- racine objet, `version` = `"2"`, aucun champ inconnu, aucun champ v1 (pas de `stations`/`ast`/`layout`) ;
- `camera` perspective : fov 42 ∈ [1,120], near 0.1 > 0, far 100 > near ;
- 2 lumières ≤ 16 ; `directional.direction` non nul ; `ambient` + `directional` ;
- 1 texture procédurale `checker` (scale 8 ∈ [1,64]) ; 2 matériaux, `sol.baseColorTexture` → `checker` résolue ;
- 2 nœuds ≤ 512 ; `dalle` : 4 sommets, 6 indices (2 triangles), uvs 8 flottants, position ∈ bornes ;
  `cube` : 8 sommets, 36 indices (12 triangles) ;
- total 14 triangles ≤ 2 097 152 ; matériaux `sol`/`metal` résolus.

---

## 6. Résumé des décisions clés

1. **Deux modes, un validateur** : `version` `"1"` (legacy `iso-scene`) / `"2"` (général), discriminateur par contenu si absent, mélange refusé sauf `title`/`caption`.
2. **Le vocabulaire v1 est un sous-ensemble figé** de v2 : `mech`/`ast`/`layout`/`tone`/`mat`/`CATALOG` restent valides avec leurs bornes exactes (`AST_LIMITS`, `STATION_RANGE`, budgets).
3. **`mesh` inline** (positions/normals/uvs/indices, triangles) est la nouvelle primitive de géométrie arbitraire.
4. **Matériaux PBR nommés** (`materials`) et **textures** (`textures`, image https/data-URI ou procédurales) remplacent la palette fermée tout en la conservant par mapping.
5. **Caméra libre** (`perspective`/`orthographic`) remplace la projection isométrique fixe ; **lumières** limitées à 16.
6. **Nœuds de projection** `mesh`/`instance`/`asset` baissent l'ancien arbre dans un graphe de nœuds acyclique (`parent`), en gardant LOD, couches de construction et budgets.
7. **Bornes strictes** : ≤ 512 nœuds, ≤ 256 maillages, ≤ 65 536 sommets et ≤ 131 072 triangles par mesh (≤ ~2 M triangles au total), ≤ 64 matériaux, ≤ 32 textures, coordonnées ∈ [-1000,1000].
8. **Sécurité** : champs inconnus refusés, URLs `https:`/`data:` uniquement, data-URI ≤ 512 Kio, textures ≤ 4096².
9. **Migration en 3 tiers** (pass-through → montée de clôture `scene3d` + `version:1` → adoption incrémentale) sans jamais réécrire un bloc existant.
10. **Backend miroir** : `iso_scene_problems` (v1) inchangé, `scene3d_problems` (v2) ajouté, test de concordance frontend↔backend conservé et étendu.
