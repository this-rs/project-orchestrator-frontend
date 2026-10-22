// GENERATED from website@426fd63fe793882ef8490df5cff1b9a4f75b2520:src/three/iso/meaning.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Index par SENS des pièces de la bibliothèque : pour chaque mécanique (`MECHANISMS`) et chaque objet du catalogue
 * (`OBJECTS`), ce que la pièce MONTRE à l'écran (lu dans sa géométrie et son geste, rien d'inventé), en anglais et en
 * français, avec des mots-clés FR + EN. Sert à choisir la pièce qui illustre une idée (« exécution parallèle » →
 * `parallel-lanes`), à la main ou par un modèle (`MEANING_COMPACT` tient dans une consigne).
 *
 * Module PUR (imports relatifs seulement, types seuls) : lu par Node dans les tests.
 */
import type { MechId } from './mechanisms.ts'

export type ObjectId = 'agent' | 'screen' | 'chip' | 'flag' | 'arrow' | 'server' | 'document' | 'node' | 'step'

export interface Meaning {
  id: MechId | ObjectId
  kind: 'mechanism' | 'object'
  /** Ce que la pièce montre, une phrase courte en anglais. */
  means: string
  /** La même chose en français. */
  means_fr: string
  /** Mots-clés FR + EN (6 à 12). */
  keywords: readonly string[]
  /** États visuels que la pièce prend. */
  states?: readonly string[]
  /** Ce que fait son geste quand le poste est servi (mécaniques seulement). */
  gesture?: string
}

export const MEANINGS: readonly Meaning[] = [
  // ── Mécaniques ────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'drawers',
    kind: 'mechanism',
    means: 'a filing cabinet whose drawers open one by one: one whole, varied contents',
    means_fr: 'un classeur dont les tiroirs s’ouvrent l’un après l’autre : un tout aux contenus divers',
    keywords: ['tiroirs', 'classeur', 'contenu', 'projet', 'organisation', 'drawers', 'cabinet', 'contents', 'project', 'organize'],
    states: ['closed, one drawer ajar at rest', 'drawer open, contents and colour tag lit'],
    gesture: 'the three drawers slide out in turn, showing their contents; the project card on top glows',
  },
  {
    id: 'dependency-graph',
    kind: 'mechanism',
    means: 'tasks turn green in dependency order until the goal raises its flag',
    means_fr: 'des tâches qui se valident dans l’ordre de leurs dépendances jusqu’au drapeau de l’objectif',
    keywords: ['dépendances', 'graphe de dépendances', 'plan', 'objectif', 'ordre', 'dependencies', 'dependency graph', 'goal', 'order', 'planning'],
    states: ['task pending (white)', 'task done (green)', 'goal reached (glowing, flag raised)'],
    gesture: 'the last tasks validate, a pulse runs along the links, the goal lights up and hoists its flag',
  },
  {
    id: 'parallel-lanes',
    kind: 'mechanism',
    means: 'a batch of tasks moves side by side down three lanes to three assistants: parallel work',
    means_fr: 'un lot de tâches avance de front sur trois voies vers trois assistants : travail en parallèle',
    keywords: ['parallèle', 'exécution parallèle', 'voies', 'simultané', 'parallel', 'parallel execution', 'lanes', 'concurrency', 'wave', 'batch'],
    states: ['task travelling (white)', 'task arrived at its assistant (glowing)'],
    gesture: 'the waves of three tasks flow faster from the hopper to the assistants',
  },
  {
    id: 'knowledge-graph',
    kind: 'mechanism',
    means: 'a graph of notes around a decision; a new note lands and links to it: knowledge that builds up',
    means_fr: 'un graphe de notes autour d’une décision ; une note se pose et s’y relie : une connaissance qui s’accumule',
    keywords: ['mémoire', 'connaissance', 'notes', 'décision', 'apprentissage', 'memory', 'knowledge', 'knowledge graph', 'decision', 'learning'],
    states: ['note falling', 'new link growing toward the decision', 'pulse travelling a link'],
    gesture: 'a new note drops into place and a glowing link grows to the central decision',
  },
  {
    id: 'local-vault',
    kind: 'mechanism',
    means: 'the original stays in a local safe; the project keeps only a link to it',
    means_fr: 'l’original reste dans un coffre local ; le projet n’en garde qu’un lien',
    keywords: ['coffre', 'local', 'fichiers', 'confidentialité', 'lien', 'vault', 'safe', 'local files', 'privacy', 'link', 'original'],
    states: ['safe closed', 'door open, originals visible', 'link chain lit'],
    gesture: 'the safe door swings open on the originals and the link chain lights up',
  },
  {
    id: 'skill-cartridge',
    kind: 'mechanism',
    means: 'the right skill cartridge rises and plugs into the assistant at the right moment',
    means_fr: 'la bonne cartouche de compétence se lève et s’enfiche dans l’assistant au bon moment',
    keywords: ['compétence', 'compétences', 'cartouche', 'savoir-faire', 'contexte', 'skill', 'skills', 'cartridge', 'plugin', 'expertise'],
    states: ['cartridges racked', 'cartridge plugged, label and visor lit'],
    gesture: 'one cartridge leaves the rack, plugs into the assistant’s back; its visor lights and a spark appears',
  },
  {
    id: 'stair-procedure',
    kind: 'mechanism',
    means: 'a token climbs a staircase; each step passed is validated: a step-by-step procedure',
    means_fr: 'un jeton gravit un escalier, chaque marche passée se valide : une procédure pas à pas',
    keywords: ['procédure', 'étapes', 'pas à pas', 'escalier', 'protocole', 'procedure', 'steps', 'step by step', 'workflow', 'checklist'],
    states: ['step pending (grey)', 'step validated (green)'],
    gesture: 'the token climbs to the top step, validating each one',
  },
  {
    id: 'consent-gate',
    kind: 'mechanism',
    means: 'a barrier between two instances that lifts only on a green light: nothing passes without consent',
    means_fr: 'une barrière entre deux instances, qui ne se lève qu’au feu vert : rien ne passe sans accord',
    keywords: ['consentement', 'accord', 'autorisation', 'barrière', 'validation', 'consent', 'approval', 'permission', 'gate', 'security'],
    states: ['waiting (red bar, amber light)', 'approved (green light, bar raised)'],
    gesture: 'the light turns green, the barrier lifts and the packet crosses to the other instance',
  },
  {
    id: 'model-selector',
    kind: 'mechanism',
    means: 'a rotary selector among four model chips; Auto turns it from one to the next',
    means_fr: 'un sélecteur rotatif entre quatre puces de modèle ; Auto le fait tourner',
    keywords: ['choix du modèle', 'modèle', 'sélecteur', 'ia', 'auto', 'model', 'model choice', 'selector', 'llm', 'provider'],
    states: ['Auto: pointer stepping chip to chip', 'one chip chosen, its core lit'],
    gesture: 'the pointer settles on one chip and its core lights up',
  },
  {
    id: 'reach-devices',
    kind: 'mechanism',
    means: 'a server sends signals to a phone and a laptop: reachable from anywhere',
    means_fr: 'un serveur envoie le signal vers un téléphone et un portable : accessible de partout',
    keywords: ['accès', 'partout', 'téléphone', 'mobile', 'distance', 'anywhere', 'remote', 'phone', 'laptop', 'devices', 'domain'],
    states: ['signals travelling', 'device screens lit'],
    gesture: 'the signals flow twice as fast from the server to both devices',
  },
  // ── Objets du catalogue ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'agent',
    kind: 'object',
    means: 'an agent: light body, glowing core, spinning ring',
    means_fr: 'un agent : corps clair, cœur lumineux, anneau qui tourne',
    keywords: ['agent', 'assistant', 'robot', 'ouvrier', 'essaim', 'worker', 'bot', 'swarm'],
  },
  {
    id: 'screen',
    kind: 'object',
    means: 'a screen on a stand facing the viewer, its display glowing',
    means_fr: 'un écran sur pied face au lecteur, son affichage lumineux',
    keywords: ['écran', 'moniteur', 'affichage', 'interface', 'screen', 'monitor', 'display', 'ui'],
  },
  {
    id: 'chip',
    kind: 'object',
    means: 'a chip: dark package, gold pins, glowing core',
    means_fr: 'une puce : boîtier sombre, broches dorées, cœur lumineux',
    keywords: ['puce', 'processeur', 'calcul', 'matériel', 'chip', 'processor', 'compute', 'hardware'],
  },
  {
    id: 'flag',
    kind: 'object',
    means: 'a flag on its pole: a goal reached',
    means_fr: 'un drapeau sur son mât : un objectif atteint',
    keywords: ['drapeau', 'objectif atteint', 'jalon', 'but', 'flag', 'milestone', 'goal reached', 'target'],
  },
  {
    id: 'arrow',
    kind: 'object',
    means: 'an arrow: one thing leads to the next',
    means_fr: 'une flèche : un enchaînement',
    keywords: ['flèche', 'enchaînement', 'suite', 'direction', 'arrow', 'next', 'flow', 'sequence'],
  },
  {
    id: 'server',
    kind: 'object',
    means: 'a server cabinet with three blinking lights',
    means_fr: 'une armoire de serveur aux trois voyants qui clignotent',
    keywords: ['serveur', 'armoire', 'hébergement', 'machine', 'server', 'rack', 'hosting', 'backend'],
  },
  {
    id: 'document',
    kind: 'object',
    means: 'a sheet with lines of text: a document',
    means_fr: 'une feuille et ses lignes de texte : un document',
    keywords: ['document', 'feuille', 'fichier', 'texte', 'page', 'file', 'sheet', 'text'],
  },
  {
    id: 'node',
    kind: 'object',
    means: 'a graph node (a note) on its stem',
    means_fr: 'un nœud de graphe (une note) sur sa tige',
    keywords: ['nœud', 'note', 'graphe', 'sommet', 'node', 'graph', 'vertex', 'point'],
  },
  {
    id: 'step',
    kind: 'object',
    means: 'a stair step whose riser glows green: one validated step',
    means_fr: 'une marche dont la contremarche s’allume en vert : une étape validée',
    keywords: ['marche', 'étape', 'étape validée', 'palier', 'step', 'stage', 'done', 'stair'],
  },
]

const STOP = new Set(
  'a au aux avec ce ces d de des du en et l la le les ou par pour sa se ses son sur un une an and as at by for from in is it its of on or the to with'.split(' '),
)

/** Minuscules, accents et ligatures retirés, ponctuation en espaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const words = (s: string): string[] => normalize(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w))

/** `a` et `b` partagent un préfixe : l'un commence l'autre, le plus court a au moins 4 lettres. */
const prefixed = (a: string, b: string): boolean => {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  return s.length >= 4 && l.startsWith(s)
}

interface Indexed {
  m: Meaning
  ids: Set<string>
  kw: Set<string>
  phrases: string[]
  text: Set<string>
}

const INDEX: Indexed[] = MEANINGS.map((m) => ({
  m,
  ids: new Set(words(m.id)),
  kw: new Set(m.keywords.flatMap(words)),
  phrases: m.keywords.map(normalize).filter((p) => p.includes(' ')),
  text: new Set([...words(m.means), ...words(m.means_fr)]),
}))

function bestIn(set: Set<string>, w: string, exact: number, prefix: number): number {
  if (set.has(w)) return exact
  for (const x of set) if (prefixed(x, w)) return prefix
  return 0
}

/** Score d'une pièce pour une requête (0 = sans rapport). */
function score(e: Indexed, q: string[], qn: string): number {
  let s = 0
  for (const w of q) s += Math.max(bestIn(e.ids, w, 3, 2), bestIn(e.kw, w, 3, 2), bestIn(e.text, w, 1, 0.5))
  for (const p of e.phrases) if (` ${qn} `.includes(` ${p} `)) s += 2
  return s
}

/**
 * Les pièces qui illustrent le mieux une idée, de la meilleure à la moins bonne (au plus `limit`, score > 0).
 * Déterministe : à score égal, l'ordre de `MEANINGS` (mécaniques avant objets).
 */
export function piecesFor(query: string, limit = 5): Meaning[] {
  const q = [...new Set(words(query))]
  if (!q.length) return []
  const qn = normalize(query)
  return INDEX.map((e, k) => ({ e, k, s: score(e, q, qn) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.k - b.k)
    .slice(0, limit)
    .map((r) => r.e.m)
}

/** Une ligne par pièce, `id: means`, à mettre dans une consigne de modèle. */
export const MEANING_COMPACT: string = MEANINGS.map((m) => `${m.id}: ${m.means}`).join('\n')
