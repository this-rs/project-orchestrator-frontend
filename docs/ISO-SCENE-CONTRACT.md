# Contrat `iso_scene` — ce que le front garantit

Un bloc `iso_scene` est écrit par un agent, lu par l'interface. Le contrat ci-dessous dit **ce qui est garanti**, et
surtout **ce qui arrive quand un bloc ne correspond pas** : jamais une erreur, toujours un refus qui explique.

## Version

Un bloc peut déclarer `"v": 1`. **Absent = 1.** Si le bloc déclare une version **supérieure** à celle que l'interface
connaît, le bloc est **refusé** avec un message qui nomme les deux versions et dit quoi faire. Il n'échoue jamais sur un
champ inconnu qui ne serait que la conséquence d'une version plus récente.

**Règle d'évolution** : ajouter un champ **ne change pas** la version (l'interface ignore ce qu'elle ne connaît pas et
le dit). On n'incrémente que pour un changement **incompatible**.

## Refus, jamais de plantage

Tout bloc invalide produit une carte de refus listant les raisons, sans casser le fil :

| Cas | Message |
|---|---|
| champ inconnu | `unknown field « warp » (title, caption, …)` — la liste des champs valides est dans le message |
| type de nœud inconnu | `type « prism » inconnu (slab, puck, sphere, tube, ring, cone, lathe, prism, capsule, repeat, torus, group, use)` |
| valeurs hors bornes | `depth attendu entre 0,01 et 6` |
| version trop récente | `bloc écrit pour iso_scene v2 — cette version de l'interface comprend v1` |

## Vocabulaire (v1)

- **Nœuds** : `slab`, `puck`, `sphere`, `tube`, `ring`, `cone`, `lathe`, `prism`, `capsule`, `repeat`, `torus`, `group`, `use`.
- **Champs de nœud** : `at`, `rot`, `tone`, `mat`, `name`, `motion`, `glow`, `detail`.
- **Scène** : `title`, `caption`, `layout`, `stations`, `angles`, `home`, `stepSeconds`, `build`, `ast`, `tone`, `label`,
  `focal`, `frame`, `bare`, `parts`, `frames`, `frameMs`, `sdf`, `v`.
- **`parts`** : `isolate` (noms courts), `explode` (0–1), `cutaway` (`{ axis, at }`).
- **Limites** : 160 formes, profondeur 8, taille 0,01–6, profil 3–32 points, **un seul trou** par `prism`,
  32 000 caractères de JSON, 24 versions par `frames`.

## Ce qui est vérifié automatiquement

- `compile.test.ts` : un bloc `v` futur est refusé en nommant les versions ;
- `iso-parts`/`iso-prism`/`iso-polygon` (site) : bornes, refus des profils invalides, aire d'un capuchon percé ;
- le banc de revue (`npm run iso:shots`) rend 14 scènes de référence et échoue si une tuile casse.
