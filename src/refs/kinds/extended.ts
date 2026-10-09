import { Building2, FileCode, Flag, FolderKanban, GitCommitHorizontal, Link2, MessageSquare, Rocket, Sparkles, UserRound, Workflow } from 'lucide-react'
import type { RefKindDef } from '../registry'

/** How the kinds added after the first five are dressed. The server decides which of them exist. */
export const conversationKind: RefKindDef = { kind: 'conversation', name: 'Conversation', Icon: MessageSquare }
export const projectKind: RefKindDef = { kind: 'project', name: 'Project', Icon: FolderKanban }
export const milestoneKind: RefKindDef = { kind: 'milestone', name: 'Milestone', Icon: Flag }
export const releaseKind: RefKindDef = { kind: 'release', name: 'Release', Icon: Rocket }
export const workspaceKind: RefKindDef = { kind: 'workspace', name: 'Workspace', Icon: Building2 }
export const commitKind: RefKindDef = { kind: 'commit', name: 'Commit', Icon: GitCommitHorizontal }
export const protocolKind: RefKindDef = { kind: 'protocol', name: 'Protocol', Icon: Workflow }
export const personaKind: RefKindDef = { kind: 'persona', name: 'Persona', Icon: UserRound }
export const skillKind: RefKindDef = { kind: 'skill', name: 'Skill', Icon: Sparkles }
export const fileKind: RefKindDef = { kind: 'file', name: 'File', Icon: FileCode }
export const linkKind: RefKindDef = { kind: 'link', name: 'Link', Icon: Link2 }
