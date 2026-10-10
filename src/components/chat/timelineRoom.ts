/**
 * What the full-screen chat sets aside so the conversation keeps its room while the
 * timeline column is open. Widths: conversations sidebar 18rem (288 px), timeline and
 * assistant tree 20rem (320 px) each.
 *
 * - from `xl`, or from `lg` without the tree: nothing (>= 416 px left at 1024 px);
 * - from `lg` with the tree: the sidebar (384 px left at 1024 px);
 * - below `lg`: the sidebar, and the tree while the timeline is open (448 px left at 768 px).
 *
 * Hidden, not covered: nothing focusable stays under the panel.
 */
export function timelineRoom({ timelineOpen, treeOpen, lg, xl }: { timelineOpen: boolean; treeOpen: boolean; lg: boolean; xl: boolean }) {
  if (!timelineOpen || xl || (lg && !treeOpen)) return { hideSidebar: false, hideTree: false }
  return { hideSidebar: true, hideTree: !lg && treeOpen }
}
