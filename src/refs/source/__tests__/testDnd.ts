/** A DataTransfer stand-in: jsdom has none. `types` mirrors what a browser exposes during a drag. */
export function makeDataTransfer(initial: Record<string, string> = {}, files: File[] = []) {
  const store = new Map(Object.entries(initial))
  const dt = {
    dropEffect: 'none',
    effectAllowed: 'all',
    files,
    get types() {
      return [...store.keys(), ...(files.length ? ['Files'] : [])]
    },
    setData: (k: string, v: string) => void store.set(k, v),
    getData: (k: string) => store.get(k) ?? '',
    clearData: () => store.clear(),
  }
  return dt as unknown as DataTransfer & { _store: Map<string, string> }
}
export const PLAN_ID = '57cf05c9-25b6-495d-ab07-de4b11d64736'
export const TASK_ID = '21ebe727-e40e-4403-88dc-97ae994a08ce'
export const NOTE_ID = '43e1084d-c01c-4016-bdee-400952de83a4'
