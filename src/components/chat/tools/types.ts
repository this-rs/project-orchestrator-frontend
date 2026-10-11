/**
 * Shared types for tool call renderers.
 *
 * Every specialized renderer receives the same props so they can be
 * swapped in/out via the registry without changing the parent component.
 */

export interface ToolRendererProps {
  /** Tool name (e.g. "Bash", "Edit", "mcp__project-orchestrator__create_plan") */
  toolName: string
  /** Parsed tool input object */
  toolInput: Record<string, unknown>
  /** Raw result content string (may be empty while running) */
  resultContent?: string
  /** Whether the tool execution resulted in an error */
  isError?: boolean
  /** Whether the tool is still running (no result yet) */
  isLoading: boolean
  /**
   * Id of this tool call (`block.metadata.tool_call_id`), when the caller has
   * one. Optional: a renderer must work without it. The sub-agent card needs it
   * — a child conversation is joined to its parent call by this id
   * (`spawned_by.tool_use_id`).
   */
  toolCallId?: string
}
