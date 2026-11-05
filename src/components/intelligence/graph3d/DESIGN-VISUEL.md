# Design visuel du graphe — 8 itérations avant le code

> But : **définir** ce que chaque entité et chaque lien doit montrer, canal par canal,
> avant d'écrire une ligne. Chaque itération part d'une critique mesurée de la précédente.
> Source des faits : `nodePoints.ts` (shapeForType, sizeForType, SPRITE_SCALE, NODE_MAX_SPRITE_PX),
> `linkFamily.ts`, `linkMagnitude.ts`, `graphPalette.ts`. Aucun chiffre inventé.

---

## Itération 1 — Inventaire : ce qui existe déjà

**Entités (19)** : `file function struct trait enum feature_graph note decision constraint skill
protocol protocol_state plan task step milestone release commit chat_session`

**Liens (3 familles)** : `structure` (`HAS_*`, `IMPORTS`, `CALLS`, `EXTENDS`…), `knowledge`
(`MENTIONS`, `AFFECTS`, `DECIDED_BY`…), `tissue` (tout le reste : `CO_CHANGED`, `TOUCHES`…).
Les liens de `structure` portent une flèche (sens), les deux autres non.
**Morphologies (8)** : `filament bundle conduit artery macrostructure network system constellation`.

**Canaux déjà utilisés** : couleur (par entité ET par couche), forme (4), taille (par type ET par
degré ET par territoire), halo, alpha de famille, morphologie de lien, densité.
**Critique** : trop de canaux pour trop peu de distinctions, et ils se contredisent (la couleur dit
l'entité *et* la couche ; la taille dit le type *et* le degré *et* le territoire). Résultat : tout
est vert, rien n'est hiérarchisé.

## Itération 2 — Un canal, une seule signification

| Canal | Dit UNE chose | Ne dit plus |
|---|---|---|
| Couleur | la **famille d'entité** (code / savoir / travail / comportement / discussion) | le type précis, la couche, l'état |
| Forme | le **type** dans sa famille | la taille, l'état |
| Taille | l'**importance structurelle** (degré), bornée | le type, le territoire |
| Halo | l'**activité** (agent, synapse, événement) | l'importance |
| Étiquette | le **nom**, jamais la couleur de la couche | l'état |

**Critique** : appliquer ça casse la palette actuelle (voir itération 3).

## Itération 3 — Collisions de couleurs : mesurées, pas supposées

Trois collisions **exactes** dans `PO_ENTITY_COLOR` :
- `decision` = `skill` = **#e879f9** → deux entités de familles différentes, indiscernables ;
- `trait` = `protocol` = **#fb7185** → idem ;
- `file` **#3ecf8e** vs `feature_graph` **#84cc16** : ΔE ≈ 8, indistinguables à 5 px.

Plus quatre cyan/teal voisins : `function #38bdf8`, `constraint #22d3ee`, `commit #67e8f9`,
`release #a3e635` sur fond noir, tous à moins de 12° de teinte.

**Règle** : une palette de famille à 5 teintes franches, et **dans chaque famille** des variantes
de clarté (pas de teinte nouvelle). 19 entités = 5 familles × 3–4 nuances.
**Critique** : la clarté seule ne suffit pas à 5 px → il faut la forme pour lever l'ambiguïté.

## Itération 4 — Les formes portent le type (4 → 6)

4 formes pour 19 types = 5 types par forme. Proposition : **6 formes** —
`disque` (masse), `anneau` (unité nommable), **`losange`** (décision), `carré` (engagement),
**`triangle`** (étape/commit = événement ponctuel), **`hexagone`** (conteneur : plan, release,
feature_graph, protocole).
**Règle** : dans une famille, deux types ne partagent jamais forme **et** nuance.
**Critique** : 6 formes sous 6 px se confondent → il faut un ordre de priorité en LOD (itération 7).

## Itération 5 — Les groupes : une enceinte, pas un mur

Un groupe est aujourd'hui un **disque plein** à son étendue réelle (jusqu'à 160 px), qui recouvre
ses propres membres — c'est le mur vert des captures du 05/11.
**Décision** : un groupe est une **enceinte** — anneau + coque translucide (alpha ≤ 0,10), intérieur
vide. Sa taille suit `count^(1/2)` bornée à 2,2× sa taille de base (déjà appliqué, commit e780b4f2).
**Critique** : une enceinte seule ne dit pas la densité → l'épaisseur de l'anneau la porte.

## Itération 6 — Les liens : une grille 3 × 8

| Famille | Couleur | Sens | Opacité de base |
|---|---|---|---|
| `structure` | teinte de la couche code | flèche | .14 |
| `knowledge` | teinte savoir | aucun | .10 |
| `tissue` | gris froid | aucun | .05 |

Largeur = **morphologie** (8 paliers, échelle log de l'ordre de grandeur) : `filament` 0,8 px →
`constellation` 5,4 px. Le poids ne touche **jamais** la couleur : sinon un lien fort et un
faisceau de liens faibles se ressemblent (mesuré : alpha 0,40 vs 0,45 pour 50 et 500).
**Critique** : 3 couleurs de famille + 8 largeurs = 24 cases ; il manque la lecture du **sens**.

## Itération 7 — LOD : ce qui survit à chaque distance

| Distance | Entités | Formes | Liens | Étiquettes |
|---|---|---|---|---|
| loin (> 2 000) | toutes, 4 px | disque/anneau seulement | filaments seuls, alpha ÷ 2 | 5 plus grosses communautés |
| moyen (800–2 000) | toutes | 6 formes | jusqu'à `artery` | 9 communautés + plans |
| près (< 800) | toutes | 6 formes | tout, flux animé | nœud survolé + voisins |

**Critique** : sans règle de retrait, le près redevient illisible — d'où le point 8.

## Itération 8 — Contraste, daltonisme, et la règle finale

- Aucune information ne repose sur la **couleur seule** : chaque famille a aussi une forme
  dominante et un halo distinct.
- Contraste minimum : luminance ≥ 0,35 sur le fond `#04040a` pour tout point ≥ 4 px.
- Test obligatoire : les 5 teintes de famille doivent rester distinctes en deutéranopie
  (simulation dans le test, pas à l'œil).
- **Règle finale** : si deux entités se ressemblent à 5 px, ce n'est pas un problème de goût,
  c'est un test qui manque.

---

## Spécification finale (à valider avant code)

### Entités — 5 familles, 19 types

| Famille | Types | Teinte | Formes |
|---|---|---|---|
| Code | file, function, struct, trait, enum | vert-émeraude (3 nuances) | disque (file, struct, enum), anneau (function, trait) |
| Savoir | note, decision, constraint, feature_graph | violet-indigo (3 nuances) | disque (note), losange (decision), anneau (constraint), hexagone (feature_graph) |
| Travail | plan, task, step, milestone, release | bleu-cyan (3 nuances) | hexagone (plan, release), carré (task, milestone), triangle (step) |
| Comportement | skill, protocol, protocol_state | rose-magenta (3 nuances) | carré (skill), hexagone (protocol), anneau (protocol_state) |
| Discussion | chat_session | jaune | carré |

Taille : `sizeForType` (3–6) × `1 + 2·min(1, log1p(degré)/log1p(64))`, plancher **4 px** de forme,
plafond **22 px** de sprite (**34 px** pour un hub, degré ≥ 64).

### Liens — 3 familles × 8 morphologies

Largeur écran : `0,8 px → 5,4 px` sur `log10(1+poids)` ; couleur = famille **seule** ; sens =
flèche pour `structure` ; flux animé réservé à `tissue` en vue rapprochée.

### Groupes
Enceinte (anneau + coque alpha ≤ 0,10), rayon `count^(1/2)` borné à 2,2× la base, étiquette =
nom + compte dans la teinte du contenu réel.

### Ce qui doit être vrai après (critères de recette)
1. Aucun sprite > 22 px (34 hub) ; aucun nœud < 2 px visible.
2. Deux entités de familles différentes ne partagent ni teinte ni forme.
3. Part de l'écran par couche dans un facteur **2** de son poids réel en nœuds.
4. Un lien de poids 50, 500, 2 000 se lit par la **largeur** (ratio ≥ 1,5 entre paliers).
5. Les 5 teintes de famille restent distinctes en deutéranopie.
