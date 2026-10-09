import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: '代码', description: '文件、函数、结构体、Trait' },
    pm: { label: '项目', description: '计划、任务、里程碑' },
    knowledge: { label: '知识', description: '笔记、决策、约束' },
    fabric: { label: '知识网络', description: 'IMPORTS、CALLS、CO_CHANGED' },
    neural: { label: '神经', description: '突触、能量、激活' },
    skills: { label: '技能', description: '自发形成的知识簇' },
    behavioral: { label: '行为', description: '协议、状态、转换（FSM）' },
    chat: { label: '聊天', description: '聊天会话及所讨论的实体' },
  },
  preset: {
    code_only: { label: '代码', description: '纯代码架构' },
    knowledge_overlay: { label: '知识', description: '叠加在代码上的笔记与决策' },
    neural_view: { label: '神经', description: '神经网络、技能与协议' },
    pm_view: { label: '项目', description: '计划、任务、里程碑' },
    impact_mode: { label: '影响', description: '影响分析' },
    behavioral_view: { label: '行为', description: '协议、技能、笔记及其相互关联' },
    full_stack: { label: '全部', description: '所有层' },
  },
  group: {
    core: '核心',
    code: '代码',
    knowledge: '知识',
    git: 'Git',
    sessions: '会话',
    features: '功能',
    behavioral: '行为',
  },
  scale: { workspace: '项目', project: '计划 + 里程碑', plan: '任务', task: '步骤' },
} satisfies Translation<'intelConfig'>
