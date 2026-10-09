/**
 * Files that draw an entity of a referenceable kind WITHOUT declaring it and
 * WITHOUT a route link the host can read, each with the reason. This list is a
 * ratchet: it can only get shorter. `RATCHET_MAX` must equal its length;
 * adding an exception means raising that number in the same diff, which a
 * reviewer will see. Declare the element instead (see the top of `refSource.ts`).
 *
 * It was 8. Four of those drew the entity as a declarative `<Link to>` (now
 * read by route, with no code), three were declared (plan runner header, task
 * agent card, conversations), and two are left, below.
 */
export const RATCHET_MAX = 2

export const COVERAGE_EXCEPTIONS: Record<string, { kinds: string[]; why: string }> = {
  'src/components/personas/PersonaBuilder.tsx': {
    kinds: ['persona'],
    why: 'A creation dialog: it navigates to the persona it has just created and closes. Nothing is listed or drawn that could be dragged; the new persona is a row of the personas page.',
  },
  'src/pages/MilestoneDetailPage.tsx': {
    kinds: ['plan', 'task'],
    why: 'Navigation from clicks on graph nodes (canvas, not DOM elements); the plans and tasks it lists are drawn by expandable/index.tsx, which is declared.',
  },
}
