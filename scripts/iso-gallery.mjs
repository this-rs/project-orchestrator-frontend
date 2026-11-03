// Galerie de référence du moteur 3D isométrique — la liste des scènes que le banc
// de revue (scripts/iso-shots.mjs) rend en planches PNG.
//
// Chaque entrée est un `iso_scene` (JSON pur, données seulement — jamais de code),
// accompagné de son slug, de son titre d'affichage, de l'intention (ce que la scène
// doit prouver) et de l'issue attendue (`ok` = la scène doit compiler et rendre,
// `refused` = elle doit être refusée proprement, sans rendu).
//
// Couverture minimale tenue ici :
//   (a) 4 mécanismes différents en solo (dependency-graph, parallel-lanes,
//       knowledge-graph, stair-procedure) ;
//   (b) une scène de 3 postes en chaîne (disposition `arch`) ;
//   (c) une scène de 6 postes (disposition `ring`) ;
//   (d) une disposition `ring` ET une `arch` ;
//   (e) des objets construits (`ast`, group/children, refs du catalogue) ;
//   (f) un objet sculpté `sdf` simple (un volume, pas un visage) ;
//   (g) une scène VOLONTAIREMENT invalide (champ inconnu) pour prouver le refus.
//
// Les modèles de données s'appuient sur compile.test.ts (scènes valides connues) et
// sur le vocabulaire de src/vendor/three-iso/ (mechanisms.ts, catalog.ts, layouts.ts).

/**
 * Un objet construit (arbre de construction), réutilisé tel quel par deux scènes
 * `ast` : des objets du catalogue emboîtés (serveur + puce accrochée, écran, agent
 * en orbite). Modèle du test compile.test.ts (scène « Server »), connu valide.
 */
const SERVER_TREE = {
  kind: 'group',
  name: 'accès',
  children: [
    {
      kind: 'group',
      name: 'serveur',
      at: [0.5, 0.3, 0],
      sockets: { sommet: [0, 0, 1.5] },
      children: [
        { kind: 'use', ref: 'server' },
        { kind: 'use', ref: 'chip', attach: 'sommet' },
      ],
    },
    { kind: 'use', ref: 'screen', at: [-0.8, -0.5, 0] },
    { kind: 'use', ref: 'agent', at: [-0.2, -0.2, 2.2], motion: { kind: 'orbit', period: 2 } },
  ],
}

export const SCENES = [
  {
    slug: 'free-robot',
    title: 'Robot composé librement (aucun objet du catalogue)',
    intent:
      "Le même petit robot, mais écrit en ARBRE : pas de use/agent, aucune pièce prédéfinie. Ce que le chat doit accepter quand je compose librement.",
    expect: 'ok',
    data: {
      title: 'Robot',
      bare: true,
      ast: {"kind":"group","children":[{"kind":"sphere","name":"corps","r":0.78,"at":[0,0,0.78]},{"kind":"slab","name":"visière","size":[0.75,0.17,0.29],"at":[0,-0.67,0.9],"mat":"dark"},{"kind":"slab","name":"fente","size":[0.52,0.07,0.07],"at":[0,-0.8,0.9],"tone":"indigo","glow":true},{"kind":"group","name":"rotor-G","at":[-0.99,0.58,1.04],"children":[{"kind":"ring","name":"anneau","r":0.44,"w":0.1,"mat":"steelL","motion":{"kind":"spin","period":2}},{"kind":"slab","name":"pale","size":[0.78,0.13,0.04],"mat":"graphite","detail":true,"motion":{"kind":"spin","period":2}}]},{"kind":"group","name":"rotor-D","at":[0.99,0.58,1.04],"children":[{"kind":"ring","name":"anneau","r":0.44,"w":0.1,"mat":"steelL","motion":{"kind":"spin","period":2,"phase":0.5}},{"kind":"slab","name":"pale","size":[0.78,0.13,0.04],"mat":"graphite","detail":true,"motion":{"kind":"spin","period":2,"phase":0.5}}]},{"kind":"tube","name":"antenne","at":[0,0,1.51],"to":[0,0,1.8],"r":0.03,"mat":"steelL","detail":true},{"kind":"sphere","name":"témoin","r":0.08,"at":[0,0,1.86],"tone":"indigo","glow":true,"motion":{"kind":"pulse","period":3}}]},
    },
  },
  {
    slug: 'robot-agent',
    title: 'Un agent — le petit robot du catalogue',
    intent:
      "Trois exemplaires de l'objet « agent » : corps, cœur lumineux, anneau qui tourne. À 340 px, la silhouette doit dire « petit robot » sans légende, et le cœur doit être le seul accent.",
    expect: 'ok',
    data: {
      title: 'Un agent',
      ast: {
        kind: 'group',
        children: [
          { kind: 'use', ref: 'agent', at: [-1.25, 0.3, 0] },
          { kind: 'use', ref: 'agent', at: [0, -0.5, 0] },
          { kind: 'use', ref: 'agent', at: [1.25, 0.3, 0] },
          { kind: 'use', ref: 'agent', at: [0, 1.1, 0] },
        ],
      },
    },
  },

  // (a) les 4 mécanismes, un par poste en gros plan.
  {
    slug: 'mech-dependency-graph',
    title: 'Mécanique : graphe de dépendances',
    intent: 'Un graphe de dépendances seul (solo) : 4 tâches reliées, drapeau d’objectif, jeton qui avance.',
    expect: 'ok',
    data: { title: 'Graphe de dépendances', stations: [{ mech: 'dependency-graph', tone: 'violet', label: 'Plan' }] },
  },
  {
    slug: 'mech-parallel-lanes',
    title: 'Mécanique : voies parallèles',
    intent: 'Trois voies parallèles seules (solo) : un lot de tâches avance de front vers trois assistants.',
    expect: 'ok',
    data: { title: 'Voies parallèles', stations: [{ mech: 'parallel-lanes', tone: 'sky', label: 'Build' }] },
  },
  {
    slug: 'mech-knowledge-graph',
    title: 'Mécanique : graphe de connaissances',
    intent: 'Un graphe de notes autour d’une décision (solo) : nœuds reliés, note qui se pose, lien qui pousse.',
    expect: 'ok',
    data: { title: 'Graphe de connaissances', stations: [{ mech: 'knowledge-graph', tone: 'green', label: 'Notes' }] },
  },
  {
    slug: 'mech-stair-procedure',
    title: 'Mécanique : procédure en escalier',
    intent: 'Un escalier de procédure seul (solo) : un jeton gravit les marches, chacune se valide.',
    expect: 'ok',
    data: { title: 'Procédure en escalier', stations: [{ mech: 'stair-procedure', tone: 'amber', label: 'Étapes' }] },
  },

  // (b) + (d) une chaîne de 3 postes sur une arche.
  {
    slug: 'chain-arch-3',
    title: 'Chaîne de 3 postes (arch)',
    intent: 'Trois postes en chaîne sur une arche (gauche → droite), dépendances `after` en séquence.',
    expect: 'ok',
    data: {
      title: 'Chaîne de trois postes',
      layout: 'arch',
      stations: [
        { mech: 'dependency-graph', tone: 'violet', label: 'Plan' },
        { mech: 'parallel-lanes', tone: 'sky', label: 'Build', after: [0] },
        { mech: 'stair-procedure', tone: 'green', label: 'Test', after: [1] },
      ],
      build: { mode: 'sequential' },
    },
  },

  // (c) + (d) six postes sur un anneau.
  {
    slug: 'six-ring',
    title: 'Six postes (ring)',
    intent: 'Six mécanismes différents posés sur un anneau (le tout et ses parties).',
    expect: 'ok',
    data: {
      title: 'Anneau de six postes',
      layout: 'ring',
      stations: [
        { mech: 'drawers', tone: 'green', label: 'Projet' },
        { mech: 'dependency-graph', tone: 'violet', label: 'Plan' },
        { mech: 'parallel-lanes', tone: 'sky', label: 'Build' },
        { mech: 'knowledge-graph', tone: 'indigo', label: 'Notes' },
        { mech: 'skill-cartridge', tone: 'amber', label: 'Skills' },
        { mech: 'stair-procedure', tone: 'red', label: 'Test' },
      ],
    },
  },

  // (e) objets construits (ast), en solo.
  {
    slug: 'ast-object',
    title: 'Objet construit (ast)',
    intent: 'Un arbre de construction seul (group/children, refs du catalogue emboîtées par sockets).',
    expect: 'ok',
    data: { title: 'Objet composé', tone: 'sky', ast: SERVER_TREE },
  },
  {
    slug: 'ast-platform',
    title: 'Plateforme composée (ast)',
    intent: 'Un socle et quatre objets du catalogue posés dessus (serveur, document, drapeau, agent).',
    expect: 'ok',
    data: {
      title: 'Plateforme de livraison',
      tone: 'green',
      ast: {
        kind: 'group',
        name: 'release',
        children: [
          { kind: 'slab', name: 'socle', size: [2.6, 1.8, 0.18], mat: 'graphite' },
          { kind: 'use', ref: 'server', at: [-0.9, -0.4, 0.18] },
          { kind: 'use', ref: 'document', at: [0.2, -0.5, 0.18] },
          { kind: 'use', ref: 'flag', at: [1.0, -0.1, 0.18] },
          { kind: 'use', ref: 'agent', at: [0.1, 0.3, 0.18], motion: { kind: 'bob', period: 2, amount: 0.1 } },
        ],
      },
    },
  },

  // (f) un objet sculpté SDF simple : un seul volume lisse, pas un visage.
  {
    slug: 'sdf-ellipsoid',
    title: 'Objet sculpté (SDF)',
    intent: 'Un ellipsoïde SDF maillé (marching tetrahedra) : un seul volume lisse, sans visage.',
    expect: 'ok',
    data: { title: 'Ellipsoïde sculpté', sdf: { res: 40, root: { kind: 'ellipsoid', radii: [0.9, 0.55, 0.7], color: 'copper' } } },
  },

  // (g) une scène volontairement invalide : le refus doit s'afficher, rien ne rend.
  {
    slug: 'invalid-unknown-field',
    title: 'Scène invalide (champ inconnu)',
    intent: 'Un champ inconnu (`warp`) doit être refusé : le refus s’affiche, pas de rendu vide.',
    expect: 'refused',
    data: { title: 'Scène invalide', stations: [{ mech: 'drawers', tone: 'green', label: 'Projet' }], warp: 9000 },
  },
]
