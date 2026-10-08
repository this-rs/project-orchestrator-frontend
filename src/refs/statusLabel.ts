/** `in_progress` -> `In progress`: the server's status word, in words a person reads (never shown raw). */
export const refStatusLabel = (status: string): string => {
  const words = status.replace(/[_-]+/g, ' ').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
