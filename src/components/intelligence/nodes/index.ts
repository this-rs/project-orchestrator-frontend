import type { NodeTypes } from '@xyflow/react'
import { FileNode } from './FileNode'
import { FunctionNode } from './FunctionNode'
import { StructNode } from './StructNode'
import { NoteNode } from './NoteNode'
import { DecisionNode } from './DecisionNode'
import { PlanNode } from './PlanNode'
import { TaskNode } from './TaskNode'
import { SkillNode } from './SkillNode'
import { ProtocolNode } from './ProtocolNode'
import { ProtocolStateNode } from './ProtocolStateNode'

export { FileNode, FunctionNode, StructNode, NoteNode, DecisionNode, PlanNode, TaskNode, SkillNode, ProtocolNode, ProtocolStateNode }

/**
 * Registry of all custom intelligence node types for ReactFlow.
 * Keys match IntelligenceEntityType values.
 */
export const intelligenceNodeTypes: NodeTypes = {
  file: FileNode,
  function: FunctionNode,
  struct: StructNode,
  note: NoteNode,
  decision: DecisionNode,
  plan: PlanNode,
  task: TaskNode,
  skill: SkillNode,
  protocol: ProtocolNode,
  protocol_state: ProtocolStateNode,
}
