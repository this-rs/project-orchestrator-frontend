import type { Translation } from '../../catalog.ts'

export default {
  agent: {
    asked: "交给子代理的任务",
    kind: "代理类型",
    answer: "它的回答",
    failed: "子代理失败",
    open: "打开子对话",
    openTitle: "打开此子代理所在的对话",
    running: "子代理仍在工作…",
    noChild: "子对话尚未列出",
    noChildTitle: "子对话按此工具调用的标识符查找。服务器列出后它就会出现。"
  },
  /** WebFetch / WebSearch: their result is data from the outside, never the assistant's text. */
  web: {
    externalSearch: "搜索结果：外部内容，并非助手所写",
    externalPage: "页面内容：外部内容，并非助手所写",
  },
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
    },
    iso: {
      loading: "正在加载 3D 场景…",
      composing: "正在编写 3D 场景…",
      refused: "此 3D 场景被拒绝 — 需要更正：",
      moreProblems: "… 还有 {count} 项",
      rebuild: "重新构建",
      notJson: "此 3D 场景不是有效的 JSON（{detail}）。其文本：",
      notObject: "此 3D 场景必须是 JSON 对象。其文本：",
      tooLarge: "此 3D 场景过大（最多 {max} 个字符）。其文本："
    }
  },
  permission: {
    actions: "回应此权限请求",
    allowOnce: "允许一次",
    allowSession: "本次会话",
    deny: "拒绝",
    sessionHint: "本对话中同一调用不再询问",
    awaiting: "正在等待确认…",
    sessionCovers: "如获准，“本次会话”仅涵盖：",
    forbidden: "只有此对话的所有者可以回答。未作任何回答。",
    ownerUnreadable: "无法确认此对话的所有者。未作任何回答，请重试。",
    unconfirmed: "未收到确认。请重新回答。",
    scopeRefused: "此权限无法在本次会话中保留（该调用会运行其他命令，或会话不提供此选项）。请允许一次或拒绝。",
    allowed: "已允许",
    allowedSession: "本次会话已允许",
    denied: "已拒绝",
    allowAlways: "始终允许",
    alwaysHint: "在本机上，此项目在其目录中运行的对话里，不再为这个完全相同的调用询问；如果对话已切换目录，则会再次询问",
    alwaysCovers: "如获允许，「始终允许」仅涵盖：",
    destinationHint: '这是一个网络目标：授权的范围由编排器决定，并在你回答后告知',
    destinationCovers: '此调用将访问：',
    destinationAlwaysHint: '可能被记录为本项目的网络同意，可在设置 → 网络工具中查看和撤销',
    destinationAlwaysCovers: '“始终”可能被记录为本项目的网络同意（设置 → 网络工具）。',
    originQuestion: "允许对此源的网络访问吗？",
    originScopes: "每种回答涵盖的范围",
    originOnce: "一次：仅此调用。不保留任何内容。",
    originSession: "本次会话：此源的所有页面，直到会话结束。不记录任何内容。",
    originSessionHint: "此源的所有页面，本次会话内",
    originAlways: "始终：记录为本项目的网络同意，适用于：",
    originAlwaysRevocable: "在 设置 → 网络工具 中列出，可撤销。",
    originAlwaysHint: "记录为本项目的网络同意，可在 设置 → 网络工具 中撤销",
    alwaysRefused: "此调用无法永久允许（只有完全相同的读取，或一条不含重定向和串联的只读命令可以）。请选择允许一次或本次会话。",
    allowedAlways: "已始终允许"
  },
  lastingRules: {
    title: "始终允许的调用",
    description: "你永久允许的调用，按项目列出。每条仅涵盖本机上在项目目录中运行的对话里那个完全相同的调用。撤销后，从本机的下一次请求起会再次询问。",
    empty: "没有永久允许的调用。",
    disabled: "此服务器不保存永久授权。",
    revoke: "撤销",
    revoked: "已撤销：从本机的下一次请求起会再次询问。",
    loadFailed: "无法加载你的永久授权。",
    revokeFailed: "无法撤销。请重试。",
    notHeld: "已不再适用",
    engineNative: "原生引擎",
    engineClaudeCode: "Claude Code",
    sandboxDisabled: "沙箱之外"
  }
} satisfies Translation<'chatA-tools'>
