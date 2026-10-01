# Baseline de couverture honnête (frontend)

Mesuré le 2026-10-01 sur `origin/main` @ d2b0cff (vitest 4.1.9, provider v8). 116 fichiers de test, 999 tests, 0 échec.

| Périmètre | Fichiers | Lignes | Couvertes | % lignes | % stmts | % branches | % fonctions |
|---|---|---|---|---|---|---|---|
| `src/**/*.{ts,tsx}` hors tests (config actuelle, `all: false`) | 556 | 28 625 | 9 076 | **31,7 %** | 31,2 | 28,1 | 31,3 |
| idem avec `all: true` | 556 | 28 625 | 9 076 | **31,7 %** | identique | identique | identique |

Constat important : sous vitest 4, l'option `coverage.all` n'existe plus (supprimée) ; tout fichier correspondant à `coverage.include` est rapporté même s'il n'est jamais importé. Les 556 fichiers de `src/` (hors tests, `.d.ts`, `main.tsx`) sont donc déjà dans le chiffre : le réglage `all: false` de `vitest.config.ts` est sans effet et son commentaire (« only files exercised by the test suite are reported ») est faux. Il n'y a pas de chiffre « gated » distinct du brut ; le patch gate (`scripts/check-patch-coverage.mjs`) reste, lui, borné aux lignes modifiées.

**245 fichiers (13 501 lignes) n'ont aucune ligne couverte** (liste en annexe).

## Par répertoire

| Répertoire `src/` | Fichiers | Lignes | Couvertes | % |
|---|---|---|---|---|
| (root) | 1 | 25 | 0 | 0.0 |
| adapters | 3 | 510 | 8 | 1.6 |
| atoms | 13 | 252 | 149 | 59.1 |
| components | 375 | 17873 | 4137 | 23.1 |
| constants | 4 | 53 | 53 | 100.0 |
| hooks | 49 | 2420 | 594 | 24.5 |
| layouts | 2 | 96 | 0 | 0.0 |
| lib | 1 | 2 | 2 | 100.0 |
| pages | 52 | 5046 | 2858 | 56.6 |
| services | 37 | 1184 | 443 | 37.4 |
| types | 7 | 17 | 8 | 47.1 |
| utils | 11 | 1047 | 824 | 78.7 |
| workers | 1 | 100 | 0 | 0.0 |

## Commandes exactes

```bash
git worktree add --detach /chemin/wt-cov-fe origin/main && cd /chemin/wt-cov-fe
npm ci
# reportsDirectory hors arbre pour ne rien polluer ; json-summary donne les totaux par fichier
npx vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=json \
  --coverage.reportsDirectory=../cov-fe
node scripts/coverage-summary.mjs ../cov-fe /chemin/wt-cov-fe   # totaux, par répertoire, fichiers à 0
```

Durée : environ 2 min.

## Annexe : fichiers jamais couverts (lignes)

```
src/App.tsx 25
src/adapters/TaskGraphAdapter.ts 103
src/components/DependencyGraphView.tsx 217
src/components/SetupGuard.tsx 24
src/components/TitleBar.tsx 39
src/components/UpdateBanner.tsx 46
src/components/WorkspaceRouteGuard.tsx 16
src/components/WorkspaceSwitcher.tsx 59
src/components/auth/PasswordLoginForm.tsx 29
src/components/auth/RegisterForm.tsx 40
src/components/auth/UserMenu.tsx 48
src/components/chat/AskUserQuestionBlock.tsx 55
src/components/chat/ChatPanel.tsx 153
src/components/chat/CompactBoundaryBlock.tsx 3
src/components/chat/CompactionBanner.tsx 2
src/components/chat/ContinueIndicatorBlock.tsx 2
src/components/chat/DetachedRunsPanel.tsx 39
src/components/chat/InputRequestBlock.tsx 9
src/components/chat/ModelChangedBlock.tsx 2
src/components/chat/PermissionSettingsPanel.tsx 99
src/components/chat/ProjectSelect.tsx 46
src/components/chat/ResultErrorBlock.tsx 1
src/components/chat/ResultMaxTurnsBlock.tsx 3
src/components/chat/RetryIndicatorBlock.tsx 4
src/components/chat/SessionBreadcrumb.tsx 20
src/components/chat/SystemHintBlock.tsx 1
src/components/chat/SystemInitBlock.tsx 5
src/components/chat/ToolCallGroup.tsx 40
src/components/chat/index.ts 0
src/components/chat/tools/DefaultToolRenderer.tsx 1
src/components/chat/tools/types.ts 0
src/components/chat/tools/mcp/ChatRenderer.tsx 78
src/components/chat/viz/ContextRadarViz.tsx 7
src/components/chat/viz/ImpactGraphViz.tsx 37
src/components/chat/viz/VizBlockRenderer.tsx 21
src/components/chat/viz/VizExpandDialog.tsx 16
src/components/code/CoChangeGraph.tsx 90
src/components/code/index.ts 0
src/components/commits/index.ts 0
src/components/composer/FSMCanvas.tsx 102
src/components/composer/NotePool.tsx 51
src/components/composer/PatternComposer.tsx 101
src/components/composer/TriggerBuilder.tsx 14
src/components/composer/index.ts 0
src/components/composer/types.ts 1
src/components/discussions/DiscussionNode.tsx 20
src/components/discussions/DiscussionTreeView.tsx 21
src/components/discussions/InlineConversationPanel.tsx 142
src/components/forms/CreateWorkspaceForm.tsx 21
src/components/forms/index.ts 0
src/components/graph/EntityGroupPanel.tsx 50
src/components/graph/UnifiedGraphSection.tsx 97
src/components/graph/entity/index.ts 0
src/components/intelligence/ActivityHeatmap3D.tsx 261
src/components/intelligence/ContextRadar.tsx 7
src/components/intelligence/GraphLoadingProgress.tsx 73
src/components/intelligence/IntelligenceGraphPage.tsx 49
src/components/intelligence/LayerControls.tsx 34
src/components/intelligence/LearningTimeline.tsx 357
src/components/intelligence/LiveIndicator.tsx 10
src/components/intelligence/NodeInspector.tsx 26
src/components/intelligence/ProtocolRanking.tsx 38
src/components/intelligence/ProtocolRunViewer.tsx 118
src/components/intelligence/SpreadingActivation.tsx 87
src/components/intelligence/VectorSpaceExplorer.tsx 658
src/components/intelligence/WorkspaceGraphPage.tsx 52
src/components/intelligence/WorkspaceLearningTimeline.tsx 376
src/components/intelligence/index.ts 0
src/components/intelligence/useGraphWebSocket.ts 202
src/components/intelligence/useIntelligenceGraph.ts 220
src/components/intelligence/useProtocolRunEvents.ts 77
src/components/intelligence/useWorkspaceIntelligenceData.ts 58
src/components/intelligence/useWorkspaceIntelligenceGraph.ts 233
src/components/intelligence/useWsAnimation.ts 20
src/components/intelligence/cards/FileContextCard.tsx 55
src/components/intelligence/cards/NoteContextCard.tsx 69
src/components/intelligence/cards/ProtocolContextCard.tsx 52
src/components/intelligence/cards/SkillContextCard.tsx 45
src/components/intelligence/edges/AffectsEdge.tsx 17
src/components/intelligence/edges/CoChangedEdge.tsx 21
src/components/intelligence/edges/SynapseEdge.tsx 47
src/components/intelligence/edges/index.ts 1
src/components/intelligence/graph3d/CommunityHulls3D.tsx 99
src/components/intelligence/graph3d/IntelligenceGraph3D.tsx 521
src/components/intelligence/graph3d/nodeObjects.ts 422
src/components/intelligence/graph3d/useActivationSync.ts 104
src/components/intelligence/graph3d/useGraph3DLayout.ts 66
src/components/intelligence/nodes/DecisionNode.tsx 7
src/components/intelligence/nodes/EnumNode.tsx 5
src/components/intelligence/nodes/FeatureGraphNode.tsx 5
src/components/intelligence/nodes/FileNode.tsx 34
src/components/intelligence/nodes/FunctionNode.tsx 6
src/components/intelligence/nodes/NoteNode.tsx 47
src/components/intelligence/nodes/PlanNode.tsx 7
src/components/intelligence/nodes/ProtocolNode.tsx 13
src/components/intelligence/nodes/ProtocolStateNode.tsx 9
src/components/intelligence/nodes/SkillNode.tsx 8
src/components/intelligence/nodes/StructNode.tsx 5
src/components/intelligence/nodes/TaskNode.tsx 7
src/components/intelligence/nodes/TraitNode.tsx 5
src/components/intelligence/nodes/index.ts 1
src/components/intelligence/vectorspace3d/VectorSpace3D.tsx 459
src/components/kanban/BoardCard.tsx 5
src/components/kanban/KanbanCard.tsx 8
src/components/kanban/KanbanFilterBar.tsx 24
src/components/kanban/ListControls.tsx 6
src/components/kanban/MilestoneKanbanCard.tsx 7
src/components/kanban/PlanKanbanCard.tsx 3
src/components/kanban/PlanKanbanFilterBar.tsx 16
src/components/kanban/UniversalKanban.tsx 57
src/components/kanban/UniversalKanbanCard.tsx 1
src/components/kanban/UniversalKanbanColumn.tsx 6
src/components/kanban/index.ts 0
src/components/kanban/configs/types.ts 0
src/components/knowledge/NeuronExplorer.tsx 119
src/components/knowledge/index.ts 1
src/components/particles/ParticleViz.tsx 97
src/components/particles/useParticleEngine.ts 119
src/components/particles/adapters/types.ts 0
src/components/particles/engine/index.ts 0
src/components/particles/scenes/AttentionScene.ts 131
src/components/particles/scenes/DelegationScene.ts 76
src/components/particles/scenes/DistributionScene.ts 158
src/components/particles/scenes/EmbeddingsScene.ts 137
src/components/particles/scenes/FeedbackLoopScene.ts 156
src/components/particles/scenes/FineTuningScene.ts 132
src/components/particles/scenes/FocusScene.ts 130
src/components/particles/scenes/HumanAIScene.ts 118
src/components/particles/scenes/MoatScene.ts 164
src/components/particles/scenes/PromptOutputScene.ts 108
src/components/particles/scenes/SignalNoiseScene.ts 106
src/components/particles/scenes/SlideDeckScenes.ts 307
src/components/particles/scenes/index.ts 0
src/components/particles/scenes/types.ts 7
src/components/particles/widgets/CommunityVizWidget.tsx 1
src/components/particles/widgets/ImpactPreviewWidget.tsx 1
src/components/particles/widgets/ProjectHealthWidget.tsx 58
src/components/particles/widgets/PropagationVizWidget.tsx 1
src/components/particles/widgets/ProtocolRunWidget.tsx 1
src/components/particles/widgets/WaveDispatchWidget.tsx 9
src/components/particles/widgets/index.ts 0
src/components/personas/index.ts 0
src/components/pipeline/ImplementDialog.tsx 9
src/components/pipeline/PipelineNodeRow.tsx 16
src/components/pipeline/PipelineProgressHeader.tsx 9
src/components/pipeline/PipelineTreeView.tsx 11
src/components/plans/PlanUniverse3D.tsx 119
src/components/plans/WaveView.tsx 100
src/components/plans/usePlanUniverse.ts 171
src/components/protocols/FsmBreadcrumbs.tsx 24
src/components/protocols/FsmViewer.tsx 76
src/components/protocols/GanttTimeline.tsx 56
src/components/protocols/RecentRunsPanel.tsx 31
src/components/protocols/RfcDashboardPage.tsx 70
src/components/protocols/RfcStatusBadge.tsx 1
src/components/protocols/RunStatusBadge.tsx 1
src/components/protocols/RunTreeView.tsx 62
src/components/protocols/ScheduledActionsPanel.tsx 47
src/components/protocols/index.ts 0
src/components/protocols/rfcLifecycle.ts 31
src/components/protocols/runHelpers.ts 8
src/components/registry/index.ts 0
src/components/runner/AgentExecutionDetail.tsx 18
src/components/runner/CancelButton.tsx 17
src/components/runner/ConversationPanel.tsx 131
src/components/runner/InlineConversation.tsx 72
src/components/runner/PlanRunHistory.tsx 31
src/components/runner/RunnerHeader.tsx 12
src/components/runner/WaveSection.tsx 12
src/components/runner/WsStatusIndicator.tsx 3
src/components/runner/index.ts 0
src/components/tasks/TaskUniverse3D.tsx 2
src/components/tasks/useTaskUniverse.ts 0
src/components/ui/AmbientBackground.tsx 1
src/components/ui/Branding.tsx 3
src/components/ui/Dropdown.tsx 34
src/components/ui/ExternalLink.tsx 18
src/components/ui/Graph3DErrorBoundary.tsx 37
src/components/ui/LinkedEntityBadge.tsx 5
src/components/ui/Pagination.tsx 28
src/components/ui/Sparkline.tsx 31
src/components/ui/StatCard.tsx 1
src/components/ui/StatusSelect.tsx 38
src/components/ui/WebUpdateBanner.tsx 3
src/components/ui/index.ts 0
src/components/ui/useFloatingFallback.ts 13
src/components/universe/Universe3DPanel.tsx 122
src/components/universe/index.ts 0
src/components/universe/useEntityUniverse.ts 154
src/constants/index.ts 0
src/hooks/index.ts 0
src/hooks/useActivationWebSocket.ts 63
src/hooks/useChatUrlSync.ts 18
src/hooks/useCrudEventSync.ts 49
src/hooks/useDetachedRuns.ts 68
src/hooks/useDiscussionTree.ts 48
src/hooks/useDragRegion.ts 9
src/hooks/useElapsedTime.ts 21
src/hooks/useEntityGroups.ts 56
src/hooks/useEventBus.ts 11
src/hooks/useInfiniteScroll.ts 23
src/hooks/useKanbanColumnData.ts 50
src/hooks/useMilestoneGraphData.ts 100
src/hooks/usePagination.ts 31
src/hooks/usePipelineProgress.ts 33
src/hooks/usePlanGraphData.ts 97
src/hooks/useSectionObserver.ts 12
src/hooks/useTaskGraphData.ts 67
src/hooks/useTrayNavigation.ts 7
src/hooks/useVisualViewportHeight.ts 33
src/hooks/useVizData.ts 95
src/hooks/useWindowFullscreen.ts 42
src/hooks/runner/index.ts 0
src/hooks/runner/useAgentExecutionsMap.ts 14
src/hooks/runner/useConversationWs.ts 88
src/hooks/runner/useLatestPlanRun.ts 6
src/hooks/runner/useRunRootSession.ts 12
src/hooks/runner/useWavesData.ts 26
src/layouts/MainLayout.tsx 96
src/layouts/index.ts 0
src/pages/ChatSessionPage.tsx 27
src/pages/LoginPage.tsx 47
src/pages/NotFoundPage.tsx 7
src/pages/ProtocolDetailPage.tsx 114
src/pages/ProtocolsPage.tsx 88
src/pages/RfcDetailPage.tsx 85
src/pages/RunnerDashboard.tsx 105
src/pages/SkillsPage.tsx 120
src/pages/index.ts 0
src/pages/setup/AuthPage.tsx 137
src/pages/setup/ChatPage.tsx 211
src/pages/setup/InfrastructurePage.tsx 119
src/pages/setup/LaunchPage.tsx 38
src/pages/setup/SetupLayout.tsx 31
src/pages/setup/SetupWizard.tsx 56
src/pages/setup/index.ts 0
src/services/environments.ts 4
src/services/index.ts 0
src/types/documents.ts 0
src/types/events.ts 0
src/types/intelligence.ts 0
src/types/protocol.ts 0
src/utils/chatExport.ts 45
src/utils/openExternal.ts 1
src/workers/dagreWorker.ts 100```
