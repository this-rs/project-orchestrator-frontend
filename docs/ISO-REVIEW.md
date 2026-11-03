# Revue ISO — empêcher de re-livrer les mêmes défauts 3D

Le bloc `iso_scene` du chat rend des scènes 3D dans une bulle de **220 px** de haut
(`src/components/chat/viz/iso/IsoSceneViz.tsx:115`, `h-[min(70vh,640px)]` en agrandi).
Ce document dit comment on les **vérifie** avant de dire « c'est bon ». Il ne décrit pas
le format (c'est `src/components/chat/viz/iso/compile.ts` et le moteur
`src/vendor/three-iso/`, copie générée du site). Il existe parce qu'on a déjà livré, plus
d'une fois, des images « vérifiées » qui ne l'étaient pas.

## 1. Pourquoi ce document existe : nos trois mensonges

On jugeait nos propres images avec notre propre outil — des proxys auto-choisis (« les
normales sont cohérentes », « ça compile ») — au lieu de lire l'image rendue. Trois
mensonges documentés en sont sortis :

1. **Le tri par profondeur (peintre) au lieu d'un z-buffer.** Les faces lointaines se
   dessinaient sur les faces avant aux silhouettes rasantes. Le moteur a réglé ça en
   gardant les faces cachées (`withHiddenFaces`) et en laissant le tampon de profondeur
   trier : `src/vendor/three-iso/iso.ts:85`, `src/vendor/three-iso/litRenderer.ts:238`.
2. **Le cadrage par le rayon au lieu du diamètre.** Un objet sortait du cadre par le haut.
   Le cadrage balaie maintenant la boîte englobante de tout le cycle (20 instants), pas un
   rayon : `src/vendor/three-iso/fit.ts:27` et `:35-46`.
3. **Les repères devinés au lieu d'être déclarés.** La boîte du sujet est **calculée** à
   partir de l'arbre (`src/three/sdfScene.ts:160-162`, `:185-193`) et le maillage posé sur
   le sol par le point le plus bas, jamais deviné : `src/three/sdfScene.ts:469-474`.

## 2. La règle

**On ne déclare jamais une scène bonne sans avoir LU son image.** Le mécanisme, la
composition, la lisibilité se jugent sur le PNG capturé, pas sur un proxy : ni « les
normales sont cohérentes », ni « ça compile », ni « la scène s'est construite sans refus »
(`compileIsoScene` ne refuse que la forme des données, `src/components/chat/viz/iso/compile.ts:163-182`).
Une scène refusée est proprement affichée avec la liste des corrections
(`IsoSceneViz.tsx:27-46`) ; une scène **acceptée** n'est pas pour autant une scène **bien
cadrée ni bien lisible**.

## 3. Comment capturer

- `npm run iso:shots` — le banc de revue des scènes iso, **à paraître**. Au moment où ce
  document est écrit, le script n'existe pas encore dans `package.json` (seul
  `qa:shots` y figure, `package.json:15`). Prévu : rendre un JSON de scène (ou une grappe
  de scènes d'exemple) dans le bloc de chat à 220 px et en agrandi, capturer le PNG, et le
  lire. Ne rien écrire d'autre en l'état.
- `npm run qa:shots` (`node scripts/qa-shots.mjs`) — le banc des **écrans de l'app**, déjà
  en place : 8 écrans × 390 / 1440 px dans un vrai Chrome headless, sans Playwright
  (`scripts/qa-shots.mjs:1-19`). Il ne couvre pas encore le bloc iso en tant que tel ; il
  montre l'état honnête de l'app où la scène vit (le chat vide affiche « Reconnecting… »).

## 4. La checklist — un bloc de 220 px, pas un film

Cochée sur le PNG capturé, jamais sur le JSON ni sur le code. Taille de référence : **220 px**
de haut (`IsoSceneViz.tsx:115`), **390 px** de large de téléphone (`scripts/qa-shots.mjs:34`).

- [ ] **Mécanisme** — les pièces qui doivent se toucher se touchent ; rien ne traverse rien ;
  la légende ne ment pas (chaque ton de la légende correspond à la pièce qu'il nomme).
- [ ] **Composition** — un seul point focal ; le sujet occupe 60–70 % du cadre ; rien
  d'important à moins de 60 px d'un bord ; une étiquette ne couvre jamais la pièce qu'elle nomme.
- [ ] **Type** — rien de tronqué (pas de texte ni de pièce coupée) ; lisible à 390 px de large.
- [ ] **3D** — pas d'aplat qui lit comme une plaque (la profondeur se lit) ; pas de blanc
  cramé ; l'émissif reste l'accent de la pièce qui travaille (une face émissive est
  multipliée par `EMIT_GAIN = 2.6`, `src/vendor/three-iso/shading.ts:40`, et porte un halo
  additif, `litRenderer.ts:540-568`).
- [ ] **Déterminisme** — même JSON → même image. L'identité d'une scène est un hash FNV-1a du
  corps (`compile.ts:60-67`) ; le bruit de matière est un hash 3D déterministe
  (`shading.ts:61-64`). Aucun `Math.random` dans le moteur ; les seuls usages du temps sont
  la scène vivante (`litRenderer.ts:242`), les transitions de caméra (`IsoGL.tsx:248`) et la
  mesure du temps de maillage (`sdfScene.ts:438`) — jamais la géométrie ni la couleur d'une
  scène figée.

## 5. Le journal de pièges

Chaque entrée : symptôme, cause, règle, fichier du moteur.

### (a) Un seul pixel NaN noircit toute l'image via un bloom

- **Symptôme** : une valeur `NaN` dans la géométrie ou la couleur rend l'image entière
  noire après le post-traitement.
- **Cause** : un bloom (post-traitement pleine image) propage un seul pixel invalide à tout
  l'écran. Le bloom est `UnrealBloomPass` dans le graphe 3D de l'intelligence —
  `src/components/intelligence/ActivityHeatmap3D.tsx:192` — **pas** dans le moteur iso, qui
  n'a pas de passe de bloom (seulement un halo additif par lampe, `litRenderer.ts:540-568`).
- **Règle** : attraper toute valeur non finie **avant** tout post-traitement. Et attention :
  un **zéro est fini** — `Number.isFinite(0)` est vrai — donc un garde-fou `Number.isFinite`
  ne voit pas un nuage effondré à l'origine (toutes coordonnées à 0). Le moteur remet à
  zéro une borne non finie sans détecter l'effondrement : `src/vendor/three-iso/camera.ts:185`.
- **Non vérifié** : le mécanisme exact « un NaN → écran noir » est un comportement de
  three.js/graph3d constaté, pas écrit dans ce dépôt ; l'iso n'a pas de bloom.

### (b) `smoothstep(a,b)` avec `a > b`

- **Symptôme** : un liseré ou un halo disparaît (rend `0`) sur Windows/ANGLE.
- **Cause** : `smoothstep` a un résultat **non défini** quand `edge0 ≥ edge1`. Cas réel dans
  le graphe 3D : `smoothstep(w, w * 0.25, abs(d - r))` — `w > w * 0.25`, donc `a > b` —
  `src/components/intelligence/graph3d/nodePoints.ts:279`.
- **Règle** : toujours écrire `smoothstep(min, max, x)` avec `min < max`. Le shader du moteur
  iso est correct : `smoothstep(0.4, 1.4, …)`, `litRenderer.ts:120`.
- **Non vérifié** : « rend 0 sous Windows/ANGLE » est un comportement de pilote ; le dépôt ne
  contient que l'appel fautif, pas la conséquence par plate-forme.

### (c) Un quad au sol avec un mapping miroir est éliminé comme face arrière

- **Symptôme** : un panneau posé au sol disparaît (ou son dessous seulement).
- **Cause** : une face est ajoutée « dans l'ordre direct vu de l'extérieur »
  (`iso.ts:212`) et éliminée si sa normale ne regarde pas l'œil :
  `if (!keepHidden && nx*VIEW[0]+ny*VIEW[1]+nz*VIEW[2] <= 0.015) return` (`iso.ts:227`).
  Un mapping miroir inverse le sens des sommets → la normale se retourne → la face est
  éliminée comme arrière. (Le loft retourne explicitement sa face inférieure :
  `this.face([...B].reverse(), o)`, `iso.ts:253`.)
- **Règle** : vérifier l'orientation (le sens des sommets) de toute face posée au sol, et
  ne pas confondre « face arrière » et « face au mauvais sens ».
- **Fichier** : `src/vendor/three-iso/iso.ts`.

### (d) Un décalque au-dessus du sol perd le test de profondeur → `polygonOffset`

- **Symptôme** : z-fighting (scintillement) entre une surface quasi-coplanaire et le sol.
- **Cause** : deux surfaces à une fraction d'unité l'une de l'autre se battent pour le même
  pixel du tampon de profondeur.
- **Règle** : la passe de carte d'ombre applique `gl.polygonOffset(3, 8)`
  (`litRenderer.ts:457-458`) pour décaler les faces opaques et casser l'auto-ombrage.
- **Non vérifié** : le chiffre précis « un dixième de millimètre » est le scénario du
  défaut, pas une constante du code ; ce que le code porte, c'est l'appel `polygonOffset`.
- **Fichier** : `src/vendor/three-iso/litRenderer.ts`.

### (e) Faces transparentes : l'ordre et le `depthMask` comptent

- **Symptôme** : une face translucide cache (ou est cachée par) ce qu'elle ne devrait pas.
- **Cause** : les faces sont triées opaques d'abord, translucides ensuite —
  `sort((a, b) => (a.alpha < 1 ? 1 : 0) - (b.alpha < 1 ? 1 : 0))` (`litRenderer.ts:286`) —
  puis les translucides sont dessinées **après** les opaques, en mélange alpha, **sans
  écrire la profondeur** : `gl.depthMask(false)` avec `blendFuncSeparate(SRC_ALPHA,
  ONE_MINUS_SRC_ALPHA, …)` (`litRenderer.ts:508-510`). Un `depthMask` mal remis ou un ordre
  inversé casse l'alpha.
- **Règle** : opaques (profondeur écrite) → sol → translucides (mélange, profondeur
  non écrite) → fil de fer → halos. Ne jamais écrire la profondeur d'une face translucide.
- **Fichier** : `src/vendor/three-iso/litRenderer.ts`.

### (f) Un détail plus petit que la résolution n'existe pas

- **Symptôme** : un détail d'une scène sculptée (`sdf`) n'apparaît jamais.
- **Cause** : le maillage est une grille en marching tetrahedra (`sdfToMesh`,
  `src/three/sdfScene.ts:445`), bornée à `res` compris entre **16 et 128** (`SDF_LIMITS.res`,
  `sdfScene.ts:49`), et la résolution est plafonnée par un budget de temps
  (`meshSdfWithinBudget`, `sdfScene.ts:87-99`, budget `MESH_BUDGET_MS = 900` dans
  `compile.ts:36`). Tout détail plus petit qu'une cellule de grille est perdu.
- **Règle** : concevoir le `sdf` à l'échelle de la résolution ; ne pas promettre un détail
  qu'une cellule ne peut pas porter. La résolution réelle est plafonnée par
  `maxResFor(leaves)` (`sdfScene.ts:102-105`).
- **Fichier** : `src/three/sdfScene.ts`.

### (g) Deux écrivains sur le même fichier détruisent une page

- **Symptôme** : un fragment de code collé au mauvais endroit, une signature changée sous
  les doigts d'un agent au milieu d'une vague.
- **Cause** : `src/vendor/three-iso/` est une **copie générée**, jamais éditée à la main —
  « ONE source of truth: the site » (`scripts/sync-iso-lib.mjs:5-14`), et un test refuse
  toute copie retouchée en comparant les sha256 (`src/components/chat/viz/iso/vendor.test.ts:25-29`).
  Deux écrivains simultanés sur un même fichier n'ont pas de merge pour les rattraper.
- **Règle** : **un seul écrivain à la fois**. On change le site, puis on re-synchronise
  (`scripts/sync-iso-lib.mjs`), jamais l'inverse.
- **Fichier** : `scripts/sync-iso-lib.mjs`.

## 6. Ce que la planche ne prouve pas

La checklist mesure des **proportions** et une **lisibilité**, pas la beauté. Une scène peut
cocher toutes les cases et rester fade — pas de matière, pas de geste lisible, pas de
hiérarchie visuelle. La planche empêche de mentir ; elle ne rend pas une scène expressive.
