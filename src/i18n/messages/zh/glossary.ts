import type { Translation } from '../../catalog.ts'

export default {
  energy: {
    label: "能量",
    description: "某个元素近期的活跃程度。能量越高，说明这个元素正被越积极地处理。",
  },
  cohesion: {
    label: "内聚度",
    description: "衡量模块或组件内部联系的紧密程度。内聚度高，意味着其中的元素彼此紧密相连。",
  },
  synapse: {
    label: "突触",
    description: "项目中两个元素（笔记、任务、文件）之间的连接，表示一种依赖或上下文关系。",
  },
  scar: {
    label: "伤痕",
    description: "过去的问题留下的痕迹。通过标出脆弱的区域，帮助避免重蹈覆辙。",
  },
  moat: {
    label: "护城河",
    description: "围绕关键组件的保护屏障。表示在那里做改动需要格外小心。",
  },
  spreading_activation: {
    label: "扩散激活",
    description: "把一个元素的重要性传播给图中相邻元素的机制，就像波浪在网络中扩散。",
  },
  fabric: {
    label: "知识网络",
    description: "项目的知识网络 — 笔记、决策和代码之间所有连接的总和。",
  },
  trajectory: {
    label: "轨迹",
    description: "智能体或任务在项目各个阶段中所走过路径的历史。",
  },
  protocol: {
    label: "协议",
    description: "描述工作流程的有限状态机，定义了各状态之间合法的转换。",
  },
  persona: {
    label: "角色",
    description: "分配给智能体的专门配置，用来引导它的行为和技能。",
  },
  episode: {
    label: "片段",
    description: "智能体的一次已记录的工作会话，包含所采取的行动和得到的结果。",
  },
  neural_routing: {
    label: "神经路由",
    description: "根据智能体的技能和工作负载，智能地把任务分配给它们。",
  },
  milestone: {
    label: "里程碑",
    description: "项目中的重要检查点。把任务归在一起，并标记进展中的关键一步。",
  },
  feature_graph: {
    label: "功能图",
    description: "以图形展示项目各功能之间的依赖，显示哪些功能依赖哪些功能。",
  },
  lifecycle_hook: {
    label: "生命周期钩子",
    description: "由状态变化触发的自动动作（例如任务变为“已完成”时发出通知）。",
  },
  constraint: {
    label: "约束",
    description: "适用于任务或计划的规则或限制。必须遵守，工作才算有效。",
  },
  decision: {
    label: "决策",
    description: "连同背景和理由一起记录下来的架构或技术选择，供日后参考。",
  },
  component: {
    label: "组件",
    description: "项目中的功能模块（后端、前端、API…），用来组织代码和职责。",
  },
  workspace: {
    label: "工作区",
    description: "把项目、任务和资源归在一起的独立容器，让不同的工作环境互不干扰。",
  },
  skill: {
    label: "技能",
    description: "智能体已记录的能力，描述它会做什么以及熟练程度。",
  },
  release: {
    label: "发布版本",
    description: "项目已发布的版本，汇集了一组可用于生产环境的变更。",
  },
  success_rate: {
    label: "成功率",
    description: "此角色成功完成的任务所占的百分比。反映它在所分配任务上的可靠程度。",
  },
  activation_count: {
    label: "激活次数",
    description: "某个元素被激活（被智能体使用）的次数。次数越多，说明该元素被调用得越频繁。",
  },
  analysis_profile: {
    label: "分析配置",
    description: "定义如何分析一个项目的配置：计算哪些指标，应用哪些阈值。",
  },
  co_change: {
    label: "共同变更",
    description: "经常一起被修改的文件。共同变更很强，说明存在耦合（有意的或无意的）。",
  },
  coupling: {
    label: "耦合度",
    description: "两个模块之间依赖的程度。为了便于维护，耦合度低更好。",
  },
  churn: {
    label: "变动频率",
    description: "一个文件被修改的频繁程度。变动频率高，可能说明该区域不稳定，或正在积极开发。",
  },
  hotspot: {
    label: "热点",
    description: "经常被修改且很复杂的文件。热点值得关注，因为缺陷的风险集中在这里。",
  },
  orphan: {
    label: "孤立文件",
    description: "既没有被其他文件导入、也没有导出给其他文件的文件。可能意味着死代码，或集成得不好的文件。",
  },
  dead_note: {
    label: "失效笔记",
    description: "没有剩余能量的笔记 — 很久没有被阅读或修改，很可能已经过时。",
  },
  stale_note: {
    label: "陈旧笔记",
    description: "内容有一阵子没有更新的笔记，可能已不再反映项目当前的状态。",
  },
  god_function: {
    label: "上帝函数",
    description: "过长或过于复杂、做了太多事情的函数。应该拆分成更小的函数。",
  },
  clustering_coefficient: {
    label: "聚类系数",
    description: "衡量一个节点的邻居之间连接的密集程度。系数高，说明这是一个紧密互联的群体。",
  },
  knowledge_coverage: {
    label: "知识覆盖率",
    description: "笔记/决策数量与代码文件数量之间的比值。表明代码是否有良好的文档。",
  },
  note_freshness: {
    label: "笔记新鲜度",
    description: "仍然是最新的笔记所占的比例。比例低，说明有许多笔记需要重新阅读。",
  },
  synapse_quality: {
    label: "突触质量",
    description: "网络中牢固连接所占的比例。弱突触是元素之间不可靠的链接。",
  },
  skills_maturity: {
    label: "技能成熟度",
    description: "活跃技能与总数的比值。表明团队在该项目上整体的熟练程度。",
  },
  code_safety: {
    label: "代码安全性",
    description: "基于风险评估的得分。考虑了关键和高风险文件以及漏洞。",
  },
  health_score: {
    label: "健康得分",
    description: "综合知识覆盖率、笔记新鲜度、神经能量、突触质量和技能成熟度的总体得分。",
  },
  circular_dependency: {
    label: "循环依赖",
    description: "两个模块相互依赖、形成回路的情况。会让代码更难维护和测试。",
  },
} satisfies Translation<'glossary'>
