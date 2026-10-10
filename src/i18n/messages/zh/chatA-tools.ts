import type { Translation } from '../../catalog.ts'

export default {
  bash: {
    emptyCommand: "（空命令）",
    showLess: "显示更少",
    showMore: "再显示 {count} 个字符",
    noOutput: "无输出",
    running: "运行中..."
  },
  default: {
    input: "输入",
    error: "错误",
    result: "结果",
    truncated: "...（已截断）"
  },
  edit: {
    replaceAll: "全部替换",
    removedLineOne: "-{count} 行",
    removedLineMany: "-{count} 行",
    addedLineOne: "+{count} 行",
    addedLineMany: "+{count} 行",
    moreRemovedOne: "... 另有 {count} 行被删除",
    moreRemovedMany: "... 另有 {count} 行被删除",
    moreAddedOne: "... 另有 {count} 行被添加",
    moreAddedMany: "... 另有 {count} 行被添加",
    truncated: "...（已截断）",
    editing: "编辑中..."
  },
  chat: {
    you: "你",
    assistant: "助手",
    messageOne: "{count} 条消息",
    messageMany: "{count} 条消息"
  },
  code: {
    copyPath: "复制路径",
    noResults: "无结果",
    searchResults: "搜索结果",
    noSymbols: "未找到符号",
    noReferences: "未找到引用",
    unknownFile: "（未知）",
    references: "引用",
    calledBy: "被调用方",
    calls: "调用",
    noCallGraph: "没有调用图数据",
    callersColon: "调用者：",
    dependentFiles: "依赖文件",
    mostConnected: "连接最多的文件",
    imports: "导入",
    importedBy: "被导入方",
    label: {
      results: "结果",
      files: "文件",
      callers: "调用者",
      callees: "被调用者",
      imports: "导入",
      dependents: "依赖方"
    },
    cat: {
      functions: "函数",
      structs: "结构体",
      enums: "枚举",
      traits: "trait",
      impls: "impl",
      macros: "宏",
      constants: "常量",
      type_aliases: "类型别名"
    },
    symbols: {
      implementations: "实现",
      traits: "Trait",
      impls: "Impl 块"
    },
    symbolsNone: {
      implementations: "未找到实现",
      traits: "未找到 trait",
      impls: "未找到 impl 块"
    }
  },
  entity: {
    project: "项目",
    created: "创建于",
    plan: "计划",
    path: "路径",
    synced: "同步于",
    target: "目标",
    verify: "验证",
    tasks: "任务",
    constraints: "约束",
    criteria: "验收标准",
    steps: "步骤",
    decisions: "决策",
    label: {
      tasks: "任务",
      constraints: "约束",
      criteria: "标准",
      steps: "步骤",
      decisions: "决策"
    },
    type: {
      plan: "计划",
      task: "任务",
      project: "项目",
      milestone: "里程碑",
      workspace: "工作区",
      note: "笔记",
      release: "发布"
    },
    view: {
      entity: "查看{entity}",
      parentTask: "查看父任务",
      parentPlan: "查看父计划",
      linkedTask: "查看关联任务",
      linkedPlan: "查看关联计划"
    },
    deleted: "已删除",
    updated: "已更新",
    createdVerb: "已创建",
    moreFields: "另有 {count} 个字段"
  },
  list: {
    untitledPlan: "无标题计划",
    untitledSession: "无标题会话",
    msgOne: "{count} 条消息",
    msgMany: "{count} 条消息",
    energy: "能量等级",
    target: "目标：{date}",
    noResults: "无结果",
    resultOne: "{count} 个结果",
    resultMany: "{count} 个结果",
    matching: "匹配“{query}”"
  },
  viz: {
    noRadar: "没有可用的雷达数据。",
    unknownTarget: "未知",
    direct: "直接（{count}）",
    transitive: "传递（{count}）",
    total: "共 {count} 个",
    importance: {
      critical: "严重",
      high: "高",
      medium: "中",
      low: "低"
    },
    kind: {
      guideline: "guideline",
      gotcha: "陷阱",
      pattern: "模式",
      context: "上下文",
      tip: "提示",
      observation: "观察",
      assertion: "断言",
      decision: "决策"
    }
  }
} satisfies Translation<'chatA-tools'>
