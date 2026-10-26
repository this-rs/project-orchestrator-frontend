# 03 — Rendu PBR et éclairage

> **Périmètre de ce document** : le pipeline de *shading* photoréaliste (PBR) et l'éclairage du futur moteur 3D général de Project Orchestrator. La géométrie, la scène, l'animation et le câblage des composants relèvent d'autres documents de cette série.
>
> **Sources lues (état actuel)** : `src/vendor/three-iso/shading.ts`, `litRenderer.ts`, `iso.ts`, `fit.ts`, `compose.ts`, `machine.ts`. Le moteur actuel est un rendu WebGL 2 brut, sans three.js, en TypeScript pur, copié généré depuis `website/src/three/iso` (décision #decision:ed774d51). Il possède déjà un BRDF Cook-Torrance/GGX *en miroir* JS (prérendu SVG) / GLSL (WebGL) — décision #decision:df29a00a.
>
> **Invariant fondamental** : le rendu WebGL et le prérendu SVG (`shading.ts::litColor`) doivent produire **les mêmes couleurs** pour la même face. Toute évolution du BRDF, de l'éclairage ou du *tone mapping* doit donc être portée **simultanément** dans le module JS pur (Node/tests) et dans les shaders GLSL. C'est un contrat de cohérence visuelle, pas une optimisation optionnelle.

---

## 1. Le BRDF PBR retenu

### 1.1 Choix

Le modèle retenu est le **microfacette Cook-Torrance avec distribution GGX (Trowbridge–Reitz), atténuation géométrique de Smith et Fresnel de Schlick**, dans la convention **metallic / roughness** (celle de glTF, Filament, Unreal, three.js `MeshStandardMaterial`).

Justifications :
- **C'est déjà le modèle en place** (`shading.ts:112-118` et le fragment shader `MAIN_FS` de `litRenderer.ts:103-111`) : le généraliser n'est pas une rupture, c'est une formalisation.
- C'est le standard *de facto* : les actifs produits par des outils tiers (Substance, Blender, glTF) s'y importent sans conversion, et la paramétrisation métal/roughness est la plus économique (deux scalaires, contre trois pour specular/glossiness).
- La plage dynamique du modèle est suffisante pour l'usage visé : petites scènes de machines « produit » et futurs espaces de graphes, avec un petit nombre de lumières et un environnement.

### 1.2 La réflectance (équations exactes)

Notations : `n` normale, `l` direction *vers* la lumière, `v` direction *vers* l'œil, `h = normalize(l + v)` demi-vecteur, `m` métallicité (0 diélectrique → 1 métal), `α` rugosité linéaire.

La réflectance totale est la somme d'un terme diffus (Lambert) et d'un terme spéculaire (microfacette) :

```
f(l, v) = f_diff(l, v) + f_spec(l, v)
```

### 1.3 Terme spéculaire Cook-Torrance / GGX

```
f_spec(l, v) = D(h) · F(v, h) · G(l, v, h) / (4 · (n·l) · (n·v))
```

**Distribution GGX** — `α` est la rugosité *perceptuelle* élevée au carré (remappage de Disney/Burley, celui déjà utilisé par le code actuel qui calcule `a = rough*rough` puis `a2 = a*a`) :

```
α = roughness²
D(h) = α² / (π · ((n·h)² · (α² − 1) + 1)²)
```

**Fresnel de Schlick** — la réflectance à incidence rasante monte de `F₀` vers 1 :

```
F₀ = 0.04 · (1 − m) + albedo · m          (0.04 = réflectance d'un diélectrique à incidence normale)
F = F₀ + (1 − F₀) · (1 − (v·h))⁵
```

> Le code actuel approxime `(v·h)` par `(n·v)` (`litRenderer.ts:110`) : valable tant que `h ≈ n`, mais le moteur général doit utiliser `v·h` proprement (différence visible sur surfaces rugueuses en lumière rasante).

**Atténuation géométrique de Smith** — deux formulations équivalentes sont retenues selon le niveau de qualité :

- *Séparable Schlick-GGX* (celle **en production aujourd'hui**, `litRenderer.ts:108`) :
  ```
  g₁(x) = 2x / (x + √(α² + (1 − α²) · x²))
  G(l, v) = g₁(n·l) · g₁(n·v)
  ```
- *Corrélé en hauteur* (cible du moteur général — meilleure conservation d'énergie, évite l'assombrissement des matériaux rugueux) :
  ```
  G₂(l, v) = 2·(n·l)·(n·v) / ( (n·l)·√(α² + (1 − α²)·(n·v)²) + (n·v)·√(α² + (1 − α²)·(n·l)²) )
  ```
  ou, sous forme Λ : `G₂ = 0.5 / (Λ(n·l) + Λ(n·v))` avec `Λ(x) = (−1 + √(1 + α²·(1/x² − 1))) / 2`.

### 1.4 Terme diffus

Lambert, **conservatif en énergie** (le diffus est pondéré par la fraction de Fresnel non réfléchie et par la non-métallicité) :

```
f_diff(l, v) = albedo · (1 − m) · (1 − F) / π
```

> Le code actuel replie le diffus dans le terme « key » **sans normalisation 1/π** (`shading.ts:133`) et applique un facteur empirique `(1 − 0.35·m)` au lieu de `(1 − F)`. Le moteur général introduit le `1/π` et le masque `(1 − m)·(1 − F)` corrects. C'est un changement de calibration : les gains `SPEC_GAIN = 4` et `EMIT_GAIN = 2.6` actuels devront être re-étalonnés pour restituer le même *look* iso (voir §5.3).

### 1.5 Conservation d'énergie et multi-scatter

Le microfacette *single-scatter* ci-dessus sous-estime la luminance aux fortes rugosités (l'énergie renvoyée « ailleurs » n'est jamais comptée). Deux options :

1. **Baseline** : accepter le single-scatter (c'est l'état actuel, et il est *visuellement* calibré pour les machines de héros).
2. **Amélioration optionnelle** : compensation multi-scatter de Filament/Kulla-Conty — `F_ss = 1/π · f(α, n·v)` pré-intégrée dans une LUT, pour un terme de réémission supplémentaire. Réservée au style « studio PBR » (§5), jamais au style iso (qui doit rester pixel-stable).

### 1.6 État actuel → cible (synthèse)

| Composante | Aujourd'hui (`shading.ts` / `MAIN_FS`) | Moteur général cible |
|---|---|---|
| Distribution | GGX (`α = roughness²`) | **inchangé** |
| Géométrie | Smith **séparable** Schlick-GGX | Smith **corrélé en hauteur** (basculable) |
| Fresnel | Schlick, `F₀ = 0.04 + (c−0.04)·m` | **inchangé**, mais sur `v·h` |
| Diffus | replié dans le terme key, sans `1/π`, masque `(1 − 0.35·m)` | Lambert `1/π`, masque `(1 − m)·(1 − F)` |
| Normalisation | `spec / (4·n·l·n·v + 1e-4)` × `SPEC_GAIN=4` | `spec / (4·n·l·n·v)` physique, gains ré-étalonnés |
| Émissif | `EMIT_GAIN=2.6` | exposition HDR, pas de gain codé en dur |

---

## 2. Pipeline de textures

### 2.1 Modèle métal / roughness

Le moteur général conserve **deux voies de matériaux de premier ordre** :

- **Procédural** (voie actuelle, prioritaire) : une couleur de base par matière (`iso.ts::MAT`, 18 matières), une table `ROUGHNESS` et une table `METALLIC` par matière (`shading.ts`), plus un **grain procédural 3D** déterministe (`grain3`, `shading.ts:61-64`) qui casse les aplats. Aucune texture, quelques Ko : c'est ce qui rend les scènes de héros légères et pré-rendables en Node.
- **Texturé** (nouveau, additif) : le même BRDF, mais les paramètres varient par texel au lieu d'être constants par matière.

### 2.2 Maps et encodage (convention glTF métal/roughness)

| Carte | Canaux | Espace | Format GPU (suggestion) |
|---|---|---|---|
| `baseColor` (albédo) | RGB (+A = opacité ou transmission) | **sRGB** | `SRGB8_ALPHA8` |
| `metallicRoughness` | **G = roughness**, **B = metallic** (R libre, souvent AO) | **linéaire** | `RG8` |
| `normal` (tangent-space) | RG (reconstruction octaédrique ou Reoriented Normal Mapping), Z reconstruit | linéaire | `RG8` |
| `occlusion` (AO) | R | linéaire | `R8` |
| `emissive` | RGB | sRGB | `SRGB8` |
| `height` | R | linéaire | `R8` |

Règles d'encodage :
- **sRGB → linéaire** au chargement pour toute carte de *couleur* (albédo, émissif), puis travail en linéaire de bout en bout (§3.1). Le décodage utilise le transfert sRGB exact, pas le simple `pow 2.2` (l'approximation `lin = pow(c, 2.2)` de `shading.ts:42` reste acceptable mais n'est pas la cible).
- Les cartes **de données** (normal, roughness, metallic, AO, hauteur) ne sont **jamais** décodées sRGB : elles sont déjà linéaires.
- La **hauteur** alimente un *parallax occlusion mapping* (POM) à l'échelle locale — pas de tessellation sur WebGL 2 (pas de *tessellation shader* ; la géométrie reste celle du LOD fourni).

### 2.3 UV et repère tangent

Le moteur actuel ne porte **aucune coordonnée UV** (les faces sont des polygones colorés plats). L'introduction de textures exige :

1. **UV procéduraux** par primitive : toutes les primitives (`iso.ts`) sont paramétriques (`loft`, `ngon`, `lathe`, `sphere`, `capsule`, `torus`, `slab`, `puck`) — on peut donc générer des UV cylindriques/sphériques/planaires sans asset, exactement comme le grain procédural actuel. Pas d'UV stockées dans le `Face`, un générateur par forme.
2. **Repère tangent** : pour les *normal maps*, il faut un triplet (T, B, N) par sommet. Deux options — tangente précalculée dans l'attribut interleavé (on étend le buffer actuel de 16 *floats*/sommet), ou dérivation à l'écran (`dFdx/dFdy`) qui évite le stockage mais lisse les détails. Le précalcul est retenu pour la stabilité.
3. Le **buffer interleavé** actuel (`litRenderer.ts:27` : position 3, normale 3, couleur 3, alpha, émission, métal, rugosité, arêtes 3 = 16 *floats*) s'étend d'un bloc optionnel (UV 2 + tangent 4) pour les faces texturées.

### 2.4 Textures : chargement et mémoires

- Les textures arrivent en **actifs distincts** (jamais dans le JSON de scène généré par le modèle — celui-ci reste des données légères, cf. décision #decision:0c66b720). Une scène peut référencer un actif par clé.
- Mipmaps + filtrage anisotrope (borné, ex. ×4) pour les vues rasantes ; *sRGB decode* au niveau du format de texture (le GPU décode à l'échantillonnage), pas en shader.

---

## 3. Éclairage

### 3.1 Principes : tout en linéaire, HDR, puis *tone mapping*

- **Espace linéaire** de bout en bout (déjà le cas : couleurs décodées en linéaire, BRDF en linéaire, ACES, puis OETF).
- Le rendu s'effectue dans une **cible HDR `RGBA16F`**, et le *tone mapping* est appliqué en post-traitement final. Aujourd'hui le shader écrit directement dans le canvas 8 bits avec `pow(aces(c), 1/2.2)` (`litRenderer.ts:127`) — correct visuellement mais limité en dynamique ; la cible 16F autorise une exposition, du *bloom* et des halos additifs sans écrêtage.
- **Rendu forward** avec une liste de lumières explicite en uniform (le bon choix : peu de lumières, matériaux simples, pas de G-buffer nécessaire). Un **forward groupé/clusterisé** n'est envisagé que si le nombre de lumières dynamiques dépasse la trentaine.

### 3.2 Directionnel + hémisphère (le rig actuel, conservé)

Le rig actuel est un **directionnel clé chaud** + une **hémisphère ciel/sol froide** + un **rim** de contre-jour (`shading.ts::LIGHTS`), direction `LIGHT = norm([0.3, 0.75, 1.0])` :

```
L_direct = key · (n·l) · shadow        (l = direction vers la lumière)
L_hemi   = mix(ground, sky, n·z·0.5 + 0.5)
L_rim    = rim · (1 − n·v)⁴
```

Le moteur général généralise ce rig en **N directionnels** (par défaut : un seul, le rig iso). Le terme hémisphérique est conservé tel quel : c'est un substitut analytique, très bon marché, de l'éclairage ambiant diffus (équivalent à un environnement à 2 bandes).

### 3.3 Point / spot

Pour les lampes de statut et les futurs points d'intérêt :

- **Atténuation physique** avec coupure douce (évite l'infini à `d=0` et le « pop » de la portée) :
  ```
  E(d) = I · clamp(1 − (d / range)⁴)² / (d² + ε)
  ```
- **Spot** : masque `pow(max(cos(angle − outer), 0), falloff)` entre cône interne et externe.
- **Budget** : un tableau d'uniformes borné (ex. 8 à 16 lumières actives), sélectionnées par proximité/importance. Les **halos additifs** des lampes (`GLOW_FS`, `litRenderer.ts:150-159`) restent le rendu de repli « pas de vrai point light » et ne partent pas.

### 3.4 Environnement HDR / IBL

Deux niveaux, comme pour les matériaux :

- **Environnement procédural analytique** (voie actuelle) : un dégradé ciel→zénith + une tache de soleil, échantillonné sur le vecteur réfléchi, réservé aux métaux (`shading.ts:120-133` : `env = sky→zen + sun·es`, pondéré `metallic·(1−rough)`). C'est le repli « zéro asset », il doit rester.
- **IBL image** (voie générale) : une carte HDR équirectangulaire → cubemap, avec la **split-sum approximation** de Karis :
  ```
  L_spec(v) ≈ prefilteredEnvColor(R, roughness) · (F₀ · A + B)
  L_diff    = irradiance · albedo / π
  ```
  - *prefilteredEnvColor* : mipmap GGX pré-filtrée (mip 0 = miroir, mip max = diffus), échantillonnée sur la réflexion `R` ;
  - `(A, B)` : LUT 2D d'intégration BRDF (échelle + biais), précalculée ou approchée analytiquement ;
  - *irradiance* : cubemap de convolution diffuse (ou harmoniques sphériques, bande 2).

L'IBL image remplace alors le terme hémisphérique *et* le terme `env` procédural, mais le rig iso garde son environnement analytique pour rester pré-rendable en Node (pas de charge d'image au prérendu).

### 3.5 Ombres

État actuel : **une** shadow map 2048×2048, projection orthographique alignée sur la lumière (`lightMatrix`, `litRenderer.ts:402-450`), **PCF 3×3 matériel** (`sampler2DShadow`, boucle 3×3), biais de normale (`aPos + aNor·0.06`) et *polygon offset* (3, 8), sol exclu du cadrage de l'ombre.

Généralisation progressive :

| Niveau | Technique | Usage |
|---|---|---|
| **Baseline (iso)** | 1 map 2048, ortho, PCF 3×3 | inchangé, pixel-stable |
| **Général** | **CSM** (cascaded shadow maps, 3–4 cascades) pour les scènes étendues ; atlas de maps par lumière | scènes larges |
| **Qualité** | **PCSS** (variance soft shadow) ou VSM pour des pénombres douces ; **cube shadow map** pour les points lights | style « studio PBR » |

Le *tone mapping* des ombres (bias, texel scale) reste configurable par style : le style iso fige les valeurs actuelles.

### 3.6 Tone mapping

L'objectif : ramener la luminance HDR vers la gamme du périphérique sans écraser les hautes lumières, puis appliquer l'OETF.

- **Exposition** : `c = c · 2^EV` (EV ajustable par style ; le style iso utilise l'exposition implicite actuelle = gains intégrés).
- **Opérateur ACES** — celui en place est l'approximation de Narkowicz (`shading.ts:47`, `litRenderer.ts:79`) :
  ```
  aces(x) = clamp( x·(2.51·x + 0.03) / (x·(2.43·x + 0.59) + 0.14), 0, 1 )
  ```
  Le moteur général peut adopter **ACES *Fitted* (Stephen Hill)** — la forme matricielle + polynôme, plus proche du rendu de référence ACES — tout en gardant Narkowicz pour le style iso (pixel-stable).
- **OETF** : transfert sRGB exact (piecewise) plutôt que `pow(1/2.2)`.
- **Post-traitements optionnels** (style studio, jamais iso) : *bloom* (seuil + flou gaussien pyramidal), *vignette*, grain film. Les **halos additifs** et le **liseré d'arête** (`litRenderer.ts:120-125`) restent des effets dédiés au style iso.

---

## 4. Caméra libre

### 4.1 Projections

Aujourd'hui la caméra n'existe pas comme objet : la projection isométrique est **codée dans le vertex shader** (`litRenderer.ts:53-58`) :

```
q = ( (x − y)·cos30 , (x + y)·0.5 − z )
s = x + y + z                       (profondeur isométrique)
k = 1 / (1 + s · focal)             (perspective faible optionnelle, focal = 0 ⇒ iso)
```

Le moteur général introduit une vraie caméra avec deux projections :

- **Perspective** (nouveau défaut pour le mode libre) : matrice `perspective(fovY, aspect, near, far)` + `lookAt(eye, target, up)`.
- **Orthographique isométrique** (le mode iso) : la projection oblique actuelle, exprimée comme une caméra ortho dont l'axe regarde la scène selon l'axe isométrique, afin que le même objet caméra couvre les deux cas. La perspective faible `focal` actuelle devient un simple réglage intermédiaire (elle est en réalité une **fausse** perspective : c'est un raccourcissement affine le long de `s`, pas une perspective conique — le mode libre doit utiliser la perspective vraie).

### 4.2 Orbite / zoom / pan

Contrôleur **turntable** (axe vertical verrouillé), le plus adapté à des scènes « produit » posées sur un sol :

- **Orbite** : yaw (azimut) + pitch (élévation), borné (ex. pitch ∈ [5°, 85°]) autour d'un point cible `target`.
- **Zoom** : en perspective = *dolly* (rapproche la caméra, `distance` bornée) ; en ortho = changement d'échelle. La molette ne touche jamais le FOV (pas d'effet « téléobjectif » accidentel).
- **Pan** : déplacement du `target` dans le plan de l'image.
- **Inertie + easing** : les transitions sont amorties (`ease`, déjà disponible dans `iso.ts`), et respectent `prefers-reduced-motion` (le mode libre se désactive au profit de la vue figée, comme `still`).
- Option **trackball** (rotation libre à 6 degrés) réservée aux scènes sans « haut » physique (graphes en apesanteur).

### 4.3 Interaction avec `fit.ts`

`fit.ts` raisonne en **boîte 2D** dans le viewBox 1200×700 : `contentBox` (boîte englobante sur 20 échantillons du cycle), `fitWindow` (« meet », centré, échelle max), `anchor` (boîte symétrique), `fitAround` (dégager le texte). Ce cadrage pilote **à la fois** le SVG prérendu et la première image WebGL — c'est le contrat visuel à ne pas casser.

Stratégie de coexistence :

1. **Le chemin iso est inchangé** : `fit.ts` reste la source de vérité du cadrage iso (prérendu + défaut WebGL). La caméra libre ne s'applique qu'aux scènes qui l'activent.
2. **Généralisation 3D** : pour le mode libre, on calcule une **sphère englobante** de la scène (à partir de la même boîte `contentBox`, reprojetée en monde via `fromView`/`unproj`), puis on dérive `distance = radius / sin(fovY/2)` de sorte que la sphère tienne dans le viewport — le même principe « meet » que `fitWindow`, transposé en 3D.
3. **La pose par défaut du mode libre reproduit le cadrage iso** : position/échelle choisies pour que la première image soit identique au cadrage `fitWindow` actuel (même `target` centré, même remplissage). L'utilisateur part de l'image connue, puis orbite.
4. **`fitAround` (dégagement de texte)** reste propre au mode iso : en orbite libre, le texte n'est plus un obstacle au centre (l'utilisateur cadre lui-même). Si un texte doit rester dégagé, on verrouille l'orbite sur les axes qui l'évitent, ou on bascule en iso.

### 4.4 Pose par défaut = iso

Règle de conception : **toute scène existante s'ouvre en iso** (projection ortho isométrique + rig `LIGHTS` + cadrage `fitWindow`). La caméra libre est un *deuxième* mode, jamais le défaut pour les machines de héros. On obtient ainsi la « bascule dans les deux sens » : iso figé ↔ studio PBR navigable, sans modifier une seule scène existante.

---

## 5. Garder le look iso comme un « style » parmi d'autres

### 5.1 Concept de « style »

Un **style** est un *bundle* nommé de choix de rendu, appliqué à une scène entière (pas par objet). Deux styles de départ :

- **`iso`** (défaut) : la reproduction exacte du rendu actuel.
- **`pbr-studio`** (ou `free`) : caméra libre perspective, IBL image, ombres PCSS/CSM, multi-scatter, post-traitements.

Le style est une **donnée de composition**, pas un branchement de code : c'est un objet de paramètres (projection, rig lumière, politique matériaux, tone mapping, contrôleur caméra, effets), résolu par le renderer en un pipeline.

### 5.2 Paramètres d'un style

| Domaine | Paramètres |
|---|---|
| Projection | `ortho-iso` (avec `focal` optionnel) ou `perspective` (`fovY`) |
| Lumière | rig directionnel+hémisphère+rim (`LIGHTS`, `LIGHT`) ; N directionnels ; point/spot ; IBL on/off |
| Matériaux | tables `ROUGHNESS`/`METALLIC` par `MAT` ; voie procédurale vs texturée ; grain on/off |
| Ombres | PCF 3×3 (iso) vs CSM/PCSS (studio) ; biais |
| Tone mapping | ACES Narkowicz (iso) vs ACES Fitted + exposition (studio) ; OETF |
| Caméra | fixe `fit.ts` (iso) vs turntable/trackball libre (studio) |
| Effets | liseré d'arête + halos + grain (iso) ; bloom/vignette (studio) |

### 5.3 Non-régression

Le style `iso` doit être **pixel-stable** : mêmes constantes (`SPEC_GAIN`, `EMIT_GAIN`, `LIGHTS`, tables `ROUGHNESS`/`METALLIC`), même ACES, même grain, même liseré. Les corrections de normalisation du §1 (`1/π`, `(1−m)(1−F)`, Smith corrélé) sont **désactivées en style iso** tant que le ré-étalonnage des gains ne restitue pas l'image actuelle au pixel près — sinon la bascule SVG→WebGL (`IsoGL.tsx`) changerait de teinte, exactement le défaut que `shading.ts` a été écrit pour empêcher.

### 5.4 Invariant miroir JS / GLSL

Conséquence directe : **toute constante, toute formule de BRDF ou de tone mapping qui affecte la couleur d'une face doit exister deux fois** — en JS pur (`shading.ts::litColor`, lu par Node au prérendu et dans les tests) et en GLSL (`MAIN_FS`). Le test de cohérence est déjà implicite (le SVG prérendu et la première image WebGL doivent être indiscernables) ; le moteur général doit le rendre **explicite** : un test qui échantillonne les deux chemins sur un jeu de faces et compare les couleurs à une tolérance. Les styles qui n'existent qu'en WebGL (`pbr-studio`) n'ont pas cette contrainte — ils n'ont pas de prérendu SVG.

### 5.5 Migration

La migration est **additive** : le style `iso` est le comportement par défaut (aucun changement pour les scènes de héros, le prérendu, les tests de composition `compose.ts`). Les nouvelles scènes (espaces de graphes, viz 3D générales) optent pour `pbr-studio`. Le passage d'une scène existante en studio est un choix de la scène, pas du moteur. Aucun `MachineDef` existant n'est modifié.

---

## 6. Résumé

1. Le BRDF retenu est **Cook-Torrance / GGX** (distribution Trowbridge–Reitz, géométrie de Smith, Fresnel de Schlick) en convention **metallic/roughness** — c'est déjà le modèle en place, qu'on formalise.
2. Diffus **Lambert `1/π`** masqué par `(1 − m)·(1 − F)` ; Smith passe de **séparable** (actuel) à **corrélé en hauteur** ; Fresnel sur `v·h` ; multi-scatter (Kulla-Conty) en option studio.
3. Textures en convention **glTF** : `baseColor` sRGB, `metallicRoughness`/`normal`/`AO`/`height` linéaires, UV procéduraux et repère tangent ajoutés ; les **matériaux procéduraux actuels restent la voie par défaut**.
4. Éclairage **linéaire HDR** (cible `RGBA16F`), rig directionnel+hémisphère+rim conservé, **point/spot** avec atténuation physique, **IBL split-sum** (cubemap pré-filtrée + LUT), environnement procédural en repli.
5. Ombres : PCF 3×3 (iso, inchangé) → **CSM/PCSS** (studio) ; tone mapping **ACES** (+ Narkowicz pour l'iso, Fitted + exposition pour le studio) puis OETF sRGB.
6. Caméra **libre turntable** (orbite/zoom/pan) avec vraie perspective ; `fit.ts` reste le cadrage iso, généralisé en **sphère englobante** pour le mode libre, et la pose par défaut reproduit le cadrage iso.
7. Le **look iso devient un « style »** (`iso`) parmi d'autres (`pbr-studio`), un bundle de paramètres résolu par le renderer.
8. **Non-régression stricte** : le style iso est pixel-stable ; les corrections physiques y sont désactivées tant qu'elles ne restituent pas l'image actuelle.
9. **Invariant miroir JS/GLSL** maintenu et rendu explicite (test de cohérence de couleurs SVG↔WebGL).
10. Migration **additive** : aucune scène existante modifiée, le studio est opt-in pour les nouvelles scènes.
