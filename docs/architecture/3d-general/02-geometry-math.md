# Cœur mathématique du moteur 3D général — géométrie & mathématiques optimisées

> Périmètre : la géométrie et les mathématiques. Pas d'implémentation. Ce document fixe les
> choix de représentation et les bornes de coût (big-O) du moteur, pour que des essaims d'agents
> puissent générer et mettre à jour des scènes en temps quasi réel.
>
> Ancrage : il généralise ce que fait déjà `src/vendor/three-iso/` — `iso.ts` (Vec3/Mat3, Frame,
> primitives loft/box/cyl/beam/tube/sphere/lathe/torus/capsule/slab/puck), `triangulate.ts`
> (éventail convexe + oreilles concaves + couture d'anneau), `fit.ts` (cadrage), `compose.ts`
> (projection isométrique `proj`, `toView/fromView`). L'existant est **orthographique, rigide,
> à tri du peintre** ; le moteur général passe au **perspectif, 4×4, tampon de profondeur**, en
> conservant le modèle d'auteur (repères hiérarchiques `Frame`).

---

## 1. Modèle de transformation : matrices 4×4 vs quaternions

### 1.1 Ce que l'existant fait

`iso.ts` ne manipule que des **rotations pures** : `Mat3` (9 flottants) + un vecteur de
translation `pos`. La composition est `mmul` (produit Mat3×Mat3), l'application est `xf`
(produit matrice-vecteur + translation). L'échelle n'existe pas dans la transformation : elle
est **cuite dans la géométrie** via le coefficient `k` de `Frame`. C'est suffisant parce que le
moteur est isométrique (projection orthographique, pas de division perspective, pas de
cisaillement). `Frame.sub(at, rot)` fournit la hiérarchie articulée (charnière, pivot, bras).

Limites pour un moteur *général* : pas de perspective, pas d'échelle anisotrope propre, pas de
forme canonique 16-float attendue par le GPU, et l'accumulation de rotations via `mmul` de
Mat3 dérive (orthogonalité perdue) faute de renormalisation.

### 1.2 Les trois candidats

| Représentation | Taille | Composition | Application à un point | Interpolation | Perspective / cisaillement |
|---|---|---|---|---|---|
| **Matrice 4×4** (homogène) | 64 o (16 f) | 64 mult. + 48 add. (général) / ~36 mult. (affine) | 16 mult. + 12 add. / ~12 mult. si w=1 | non (lerp de matrices faux) | **oui** (projection, cisaillement) |
| **Quaternion unitaire** (rotation seule) | 16 o (4 f) | 16 mult. + 12 add. | ~18–24 mult. | **oui** (slerp/nlerp, sans verrou de cardan) | non (rotation pure) |
| **Quaternion dual** (rigide : rot + translation) | 32 o (8 f) | ~48 mult. | ~40 mult. | oui (rigide, évite l'effet « candy wrapper ») | non |

Coûts complémentaires utiles : `slerp` ≈ 2 produits de quaternions + trigonométrie (~40–50
op.) ; ré-orthogonalisation d'une Mat3 (Gram-Schmidt) ≈ 15–25 op. ; renormalisation d'un
quaternion ≈ 1 racine carrée + 4 divisions.

### 1.3 Choix

**Représentation d'auteur : TRS décomposé** — translation (vec3) + **quaternion unitaire** +
échelle (vec3, ou scalaire si uniforme). Soit 40 o/nœud (32 o en échelle uniforme).

**Représentation de travail : matrice affine 4×4 colonne-majeur** (64 o), dérivée du TRS par
M = T · R · S. C'est la seule forme que consomment tous les étages en aval : le vertex shader
(uniform/SSBO), la physique, le lancer de rayon, WebGL/three.js. Le quaternion n'est **jamais**
envoyé tel quel au GPU : il est aplati en matrice une fois par nœud et par frame.

Justification :

1. **Le quaternion est la forme d'auteur, pas la forme de calcul GPU.** Il est compact (4× moins
   que Mat4), sans verrou de cardan, et surtout **interpolable** — c'est ce dont un essaim
   d'agents a besoin pour exprimer « pivote de 30° autour de cet axe », « slerp entre deux
   orientations », « anime cette articulation ». Une matrice ne s'interpole pas.
2. **La matrice 4×4 est la forme de consommation.** Un sommet de rendu, un test de collision ou
   un frustum se multiplient par une matrice ; conserver le quaternion comme forme unique
   imposerait une conversion à chaque usage (gaspillage).
3. **Le quaternion dual est un cas particulier** : ne le garder que pour le *skinning* et
   l'interpolation rigide d'animation, jamais comme épine dorsale du graphe de scène.
4. **Échelle** : le TRS explicite sépare l'échelle (utile pour réutiliser un gabarit à plusieurs
   tailles, cf. `Frame.scaled`) de la rotation ; l'existant la cuit dans la géométrie, ce qui
   fragmente le cache de maillage. La découpler permet l'instanciation (section 4).

### 1.4 Graphe de scène & propagation

Chaque nœud stocke son **TRS local** ; la matrice monde d'un nœud est le produit des matrices
locales de la racine jusqu'à lui. Pour tenir la cible « temps quasi réel » :

- **Propagation par salissure** (dirty flags) : une modification de TRS marque le sous-arbre ;
  on ne recompute que les matrices monde des nœuds modifiés. Coût **O(1) amorti** par
  modification locale, **O(n)** dans le pire cas (racine modifiée).
- **Accumulation incrémentale des rotations en quaternion** avec renormalisation périodique
  (dérive d'orthogonalité contenue à ~10⁻⁶ près), au lieu de ré-orthogonaliser des matrices à
  chaque frame (plus cher, moins stable dans le temps).
- **Un seul tampon de matrices monde** (SSBO/UBO) rempli en une passe contiguë par frame :
  c'est le vecteur d'instanciation (section 4), pas une donnée par maillage.

---

## 2. Triangulation de maillages arbitraires

### 2.1 Ce que l'existant fait déjà (`triangulate.ts`)

- **Projection 2D** sur le plan le plus ouvert : on laisse tomber l'axe dominant de la normale.
- **Éventail (fan)** si le polygone est convexe : O(n).
- **Coupe d'oreilles** (ear clipping) sinon : O(n²) naïf (test d'intériorité O(n) par oreille
  candidate), avec repli sur suppression des sommets alignés (doublons de couture).
- **Couture d'anneau** : un anneau complet (0→2π) est détecté par ses sommets de couture en
  double et triangulé en bande, sans tirer d'éventail en travers du trou.
- La **normale** utilisée est celle de Newell (somme des produits croisés, pondérée par l'aire) :
  c'est déjà la méthode robuste pour les polygones **non planaires** (elle donne le vecteur du
  plan moyen).

C'est correct mais limité : ear clipping O(n²), pas de trous arbitraires multiples, pas de
structure topologique partagée.

### 2.2 Conception générale

**Normalisation préalable (toute face, avant triangulation).**

1. **Normale de Newell** n = Σᵢ (pᵢ × pᵢ₊₁), robuste aux polygones non planaires ; elle définit
   le **plan moyen**. Si ‖n‖ ≈ 0 (polygone dégénéré / aligné), écarter la face.
2. **Projection sur le plan dominant** : on choisit l'axe à éliminer selon |nₓ|, |n_y|, |n_z|
   (comme `triangulate.ts`), ou — plus robuste pour les non-planaires très déformés — sur le
   **plan best-fit** (moindres carrés) calculé à partir de la normale de Newell.
3. **Snapping de couture** : fusion des sommets à distance < ε (échelle relative) pour refermer
   les trous et les anneaux ; c'est le mécanisme qui permet de « coudre » les polygones à fente.

**Stratégies de triangulation, par complexité croissante.**

| Cas | Algorithme | Complexité | Remarque |
|---|---|---|---|
| Convexe simple | éventail | O(n) | chemin rapide, comme l'existant |
| Concave simple (sans trou) | coupe d'oreilles | O(n²) naïf, ~O(n log n) avec index spatial | suffisant pour les profils de mécanique |
| **Trous multiples** | **triangulation de Delaunay contrainte (CDT)** | O(n log n) attendu | ponts (seam edges) entre contour externe et trous |
| Topologie partagée / jointures | half-edge (DCEL) | construction O(n) | adjacence, frontières, soudure entre pièces |

**Recommandation.** Utiliser la **CDT contrainte** comme unique chemin de triangulation des
polygones *avec trous* (la forme la plus générale), et garder les chemins rapides (éventail
convexe, bande d'anneau) comme cas particuliers courts-circuités. Le tout en **géométrie
indexée** : un seul tampon de positions + un tampon d'indices, avec **déduplication des sommets**
(table de hachage sur les coordonnées quantifiées) pour garantir un maillage **étanche
(watertight)** — condition nécessaire aux CSG par maillage, à l'occlusion et aux ombres.

**Normales par sommet** : après triangulation, accumuler les normales de face **pondérées par
l'angle** à chaque sommet partagé, puis normaliser. C'est la généralisation des normales lisses
déjà présentes (`nrm`, arêtes `soft`) pour les flancs de cylindres et tubes.

**Robustesse numérique** : pour la CDT et les CSG par maillage, utiliser des **prédicats
d'orientation exacts** (orientation à erreur nulle, style Shewchuk) au lieu du produit vectoriel
flottant naïf ; sinon les cas coplanaires / quasi dégénérés ouvrent des trous. L'epsilon de
couture ne remplace pas l'exactitude, il la complète.

### 2.3 Synthèse des ordres

- Fan convexe : **O(n)**.
- Ear clipping : **O(n²)** naïf, **~O(n log n)** avec index spatial.
- CDT (trous) : **O(n log n)** attendu.
- Déduplication (hash) : **O(n)** attendu, O(n²) collisionnel.
- Normales par sommet : **O(F)** (une passe sur les faces).

---

## 3. Opérations SDF / CSG pour la construction procédurale

Deux familles coexistent, avec des rôles distincts.

### 3.1 SDF (champs de distance signés) — l'auteur procédural organique

Une SDF est une fonction f : ℝ³ → ℝ donnant la distance signée au solide (négative dedans,
positive dehors). C'est la **forme d'auteur idéale pour un agent** : un petit arbre d'expression,
bon marché à évaluer, composable, et **convertible en maillage une seule fois** puis mis en
cache. C'est l'équivalent implicite des primitives `loft/lathe/torus` de l'existant.

**Primitives à retenir** (formules standard, coût O(1) chacune) : sphère, boîte, **boîte
arrondie**, cylindre, **capsule (segment)**, tore, plan, cône, tore rectangulaire.

**Combinators booléens (durs).**

- Union : `min(f₁, f₂)`.
- Intersection : `max(f₁, f₂)`.
- Soustraction : `max(−f₁, f₂)` (retrancher f₁ de f₂).

**Lissage (famille polynomiale, C¹, rayon de fusion k).**

- Union lisse : `smin(a,b,k) = mix(b,a,h) − k·h·(1−h)` avec `h = clamp(½ + ½·(b−a)/k, 0, 1)`.
- Intersection lisse : `smax(a,b,k) = −smin(−a,−b,k)`.
- Soustraction lisse : `ssub(a,b,k) = smin(a,−b,k)`.

Le paramètre `k` contrôle l'étendue du raccord ; `k→0` redonne l'opération dure. C'est la
généralisation des chanfreins/biseaux déjà présents dans `slab` et `puck`, mais en continu.

**Déformations / modificateurs utiles à l'essaim.**

- **Arrondi (offset)** : `f − r` (gonfle le solide de r).
- **Coque (onion)** : `|f| − r` (épaissit en coquille d'épaisseur r).
- **Répétition de domaine** : `p = mod(p + ½c, c) − ½c` — grille infinie d'instances (très utile
  aux essaims : un réseau de plots, de dents, de poteaux en une expression).
- **Élongation** : soustraire le rayon à la distance 2D au segment (capsule).
- **Torsion / courbure** : transformation de domaine (non linéaire) avant évaluation.

Contrainte de continuité : pour un raymarching sûr, f doit être **1-Lipschitz** (pas de saut de
plus d'une unité de distance par unité de déplacement). Pour la *conversion en maillage*, cette
exigence est relâchée (seule l'isosurface compte).

**Conversion SDF → maillage** : **marching cubes** (15 cas de base sur 256 configurations) sur
une grille régulière, **O(G)** cellules où G = résolution³ ; en variante adaptative/creuse, O(S)
où S = cellules de surface. Pour préserver les arêtes vives, préférer **dual contouring / surface
nets**. Choix de résolution : une grille 128³ = 2 M cellules est déjà confortable ; 256³ = 16 M
cellules devient le point où il faut l'octree adaptatif. **Le maillage converti est mis en cache** :
un agent ne paye la conversion qu'une fois par forme.

### 3.2 CSG par maillage (BSP) — la mécanique exacte

Pour des pièces mécaniques *précises* (perçages, engrenages, rainures), la SDF approchée ne
suffit pas. On opère alors directement sur des maillages triangulés par **arbres BSP** :
soustraction = découpe des triangles d'un opérande contre les demi-espaces de l'autre, puis
reconstruction de la frontière.

- Complexité : **O(n log n)** attendu, **O(n²)** dans le pire cas (découpe dense).
- **Fragilité** : faces coplanaires, intersections quasi dégénérées → trous. Exiger des
  prédicats exacts (cf. §2.2) et du snapping.
- Ces opérations sont coûteuses : les **exécuter hors boucle temps réel** (au moment de la
  génération), jamais par frame.

### 3.3 Partage des rôles (décision architecturale)

- **B-rep exact** (loft, extrusion, lathe, tube — comme `iso.ts`) : la mécanique, les engrenages,
  les axes. Précis, paramétrable, déjà éprouvé.
- **SDF** : les formes organiques, les raccords lissés, les répétitions d'essaim (réseaux), les
  volumes qu'un agent exprime en une expression. Converti en maillage une fois, mis en cache.
- **CSG/BSP par maillage** : uniquement les combinaisons booléennes *exactes* entre pièces
  mécaniques, hors ligne.

Un agent compose donc les trois : il décrit en B-rep/SDF, le moteur fige en maillage indexé et
cache, puis le rendu ne voit plus que des maillages.

---

## 4. Optimisations et complexités

Le vrai budget d'un essaim n'est pas le nombre de triangles (le GPU en avale des dizaines de
millions) mais le **CPU** : appels de dessin, tri, remontée des transformations. D'où l'ordre
des leviers ci-dessous.

### 4.1 Instanciation GPU

Une même géométrie dessinée N fois avec une **matrice monde par instance** (lue dans le SSBO de
la §1.4) en **un seul appel de dessin**. Coût : **O(1)** appels par *classe* de géométrie, au
lieu de **O(N)**. La géométrie est envoyée **une fois** (upload amorti O(1)) ; seule la matrice
(et une teinte/ID) varie par instance. C'est la raison pour laquelle l'échelle doit être sortie
de la géométrie (§1.3) : deux tailles d'un même gabarit deviennent deux instances, pas deux
maillages.

### 4.2 Niveaux de détail (LOD)

- **LOD continu** : simplification par **erreur quadratique (QEM, Garland–Heckbert)** — effondrement
  d'arêtes piloté par un tas d'erreurs. Précalcul **O(n log n)** ; une seule chaîne de maillages
  servant tous les niveaux (sélection de l'arête à effondrer selon la distance).
- **Sélection** par taille projetée / distance : **O(1)** par objet par frame.
- **Coût mémoire** : la chaîne de niveaux où chaque niveau divise par 2 la résolution linéaire
  (≈ ¼ des triangles sur une surface) somme à **≈ 1,33×** le maillage plein (série 1 + ¼ + ⅟₁₆ + …).

### 4.3 Culling

| Technique | Coût par objet | Total | Note |
|---|---|---|---|
| Backface (produit scalaire normale·vue) | O(1) par face | O(F) | déjà dans `iso.ts` |
| **Frustum** (AABB/sphère vs 6 plans) | O(6) | **O(n)** brut, ~O(k + log n) avec BVH | k = visibles |
| **Occlusion** : hiérarchie de profondeur (HZB) + requêtes | O(1) amorti | O(k + log n) | deux passes, early-Z |
| **Occlusion** : PVS précalculé (scène statique) | O(1) | O(1) | tables de visibilité |
| Tri du peintre (transparents) | O(1) | **O(F log F)** | à réserver aux alpha |

**Changement de paradigme par rapport à l'existant** : `iso.ts` trie *toutes* les faces du fond
vers l'avant (peintre, O(F log F)) parce qu'il n'a pas de profondeur. Le moteur général utilise
un **tampon de profondeur + early-Z** (O(1) par fragment, aucune dépendance d'ordre pour les
opaques) et ne garde le tri du peintre que pour la passe transparente. Le backface culling
matériel (ou le test normal·vue de l'existant) reste un pré-filtre O(1)/face.

### 4.4 Hachage spatial (voisinage d'essaim)

Pour les requêtes de voisinage — collisions entre agents, plus proche voisin, mise à jour locale
— une **grille uniforme hachée** des AABB :

- **Insertion / requête O(1)** par objet et par cellule.
- **Total O(n)** tant que la densité par cellule reste bornée ; **dégénère en O(n²)** si tous les
  objets tombent dans une même cellule (choix de taille de cellule à caler sur le rayon
  d'interaction).
- Alternative : **BVH/octree/k-d tree** — construction O(n log n), requête O(log n) — meilleur
  quand la distribution est très hétérogène ou la scène largement statique.

### 4.5 Synthèse des ordres (récapitulatif)

| Opération | Complexité |
|---|---|
| Composition de 2 rotations (quat / Mat3 / Mat4) | 16 / 27 / 64 mult. |
| Application à un point (quat / Mat3 / Mat4 affine) | ~24 / 9+6 / ~12+9 mult. |
| Mise à jour du graphe de scène (dirty) | O(1) amorti, O(n) pire cas |
| Triangulation (fan / oreilles / CDT) | O(n) / O(n²) / O(n log n) |
| Déduplication + normales par sommet | O(n) + O(F) |
| SDF (évaluation) / marching cubes | O(1) / O(G) ou O(S) |
| CSG-BSP par maillage | O(n log n) attendu |
| QEM (LOD continu) | O(n log n) précalcul |
| Frustum / occlusion | O(n) → O(k + log n) avec BVH |
| Tri du peintre | O(F log F) |
| Hachage spatial | O(1)/objet, O(n) total |

---

## 5. Exemple chiffré : scène « mécanisme »

Scénario type (calqué sur les machines de héros de `three-iso`, dont les défauts par primitive
sont repris : cylindre n=14, sphère seg=14/rings=8, tube n=10, puck n=24, dalle chanfreinée
profil 8) : un **châssis** + **8 postes** (dalle, arbre, engrenage, voyant capsule, palet,
tube de liaison).

### 5.1 Budget de faces

| Élément | Primitive (défauts existants) | Faces estimées |
|---|---|---|
| Châssis : 4 poutres (segmentées ≤ 3 u) | `beam` rect, 6 faces × ~3 seg. | ≈ 72 |
| Châssis : 4 tubes (n=10, segmentés) | `tube`, 12 faces × ~2 seg. | ≈ 96 |
| Par poste : dalle chanfreinée (8-gon) | `slab` | ≈ 20 |
| Par poste : arbre (n=8) | `cylAxis` | ≈ 10 |
| Par poste : engrenage (lathe, profil 6, n=20) | `lathe` | ≈ 102 |
| Par poste : voyant (capsule seg=12/rings=6) | `capsule` | ≈ 158 |
| Par poste : palet (n=24) | `puck` | ≈ 50 |
| Par poste : tube de liaison (n=8) | `tube` | ≈ 10 |

- **Faces** : châssis ≈ 168 + 8 × 350 ≈ **≈ 3 000 faces**.
- **Triangles** : un quad → 2 triangles, une calotte → (n−2). Facteur moyen ≈ 2,1 →
  **≈ 6 300 triangles**.
- **Sommets uniques** (maillage indexé fermé, formule d'Euler V ≈ F/2 + 2) : **≈ 3 200**.

### 5.2 Ce que coûte réellement la scène

- **GPU** : 6 300 triangles × 60 fps ≈ **380 k triangles/s** — négligeable (un GPU moderne en
  traite 100 M à 1 G/s). Le triangle n'est **pas** la contrainte.
- **CPU — appels de dessin** : sans instanciation, ≈ 56 maillages → ≈ 56 appels ; avec
  instanciation, **1 appel par classe de géométrie ≈ 8–12 appels** (levier n°1).
- **CPU — tri** : 3 000 faces au peintre = 3 000·log₂(3 000) ≈ 35 k comparaisons/frame ; le
  tampon de profondeur ramène cela à **O(1)/fragment**, le tri ne restant que pour la passe
  transparente (levier n°2).
- **CPU — remontée des transformations** : 3 200 sommets/frame en une passe contiguë vers le
  SSBO (instanciation), contre ~56 uploads dispersés (levier n°3).

### 5.3 Lecture du budget pour un essaim

À cette échelle, le plafond est **CPU, pas GPU**. Les trois leviers dans l'ordre : (1)
**instanciation** (réduire les appels de dessin et l'upload), (2) **tampon de profondeur + early-Z**
(supprimer le tri global), (3) **frustum + occlusion + LOD** (ne dessiner que ce qui est visible
et utile). Le hachage spatial, lui, sert la *logique* de l'essaim (collision, voisinage, mise à
jour locale), pas le dessin. Un agent qui ajoute/retire une pièce ne régénère pas le maillage
global : il insère un nœud TRS, marque le sous-arbre sale, et laisse le moteur propager et
ré-instancier en O(1) amorti.

---

## Résumé (≤ 10 lignes)

Le moteur général stocke chaque nœud en **TRS décomposé (translation + quaternion + échelle)** —
forme d'auteur compacte, interpolable, sans verrou de cardan — et l'aplatit en **matrice affine
4×4** pour le GPU, avec propagation par salissure en O(1) amorti. La triangulation passe d'un
ear-clipping O(n²) à une **CDT contrainte O(n log n)** pour les trous, en géométrie indexée
étanche, avec prédicats exacts. La construction procédurale combine **B-rep exact** (mécanique),
**SDF + marching cubes** (organique, réseaux d'essaim, lissage par `smin`) et **CSG-BSP hors
ligne** (perçages exacts). Les optimisations dominantes sont, dans l'ordre, **instanciation GPU
(O(1) appels/classe)**, **tampon de profondeur + early-Z** (supprime le tri O(F log F) du
peintre), puis **frustum/occlusion + LOD** ; le hachage spatial sert la logique de voisinage en
O(n). Sur la scène « mécanisme » type (≈ 3 000 faces, 6 300 triangles, 3 200 sommets), le
plafond est **CPU** : l'instanciation ramène ~56 appels de dessin à ~10, et 380 k triangles/s au
GPU restent négligeables.
