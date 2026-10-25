/** The typed cause the server prefixes a refused search with (`ToolAccessError::code`). */
export const TOOL_ENGINE_NOT_INSTALLED = 'tool_engine_not_installed'

/** True when a tool result is the refusal "this installation has no built-in engine". */
export function isEngineNotInstalled(isError: boolean | undefined, content: string | undefined): boolean {
  return !!isError && typeof content === 'string' && content.trimStart().startsWith(`${TOOL_ENGINE_NOT_INSTALLED}:`)
}
