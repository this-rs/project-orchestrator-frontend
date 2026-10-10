import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: "自动批准编辑",
    ask: "询问",
    plan_only: "仅规划",
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: "接受编辑",
    ask: "默认",
    plan_only: "仅规划",
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: "接受编辑",
    ask: "询问权限",
    plan_only: "规划模式",
  },
  native: {
    auto: { short: "自动", long: "自动模式" },
    dontAsk: { short: "不再询问", long: "不要询问" },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: "自动批准所有工具，不弹出提示。" },
      auto_edits: { label: "接受编辑", description: "自动批准文件编辑，命令仍会提示。" },
      ask: { label: "默认", description: "所有工具调用都会提示。" },
      plan_only: { label: "仅规划", description: "只读模式，不写入也不执行命令。" },
    },
    neutral: {
      trust: { description: "运行所有工具，无需询问。" },
      auto_edits: { description: "文件编辑无需询问；命令仍会询问。" },
      ask: { description: "每次调用工具前都询问。" },
      plan_only: { description: "只读，不写入也不执行命令。" },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: "所有工具自动批准 — 没有权限提示",
      summary: "Rock'n roll（全部自动批准）",
    },
    ask: {
      label: "默认",
      description: "文件编辑和 shell 命令需要批准",
      summary: "默认（编辑和 shell 需询问）",
    },
    auto_edits: {
      label: "接受编辑",
      description: "文件编辑自动批准，shell 命令需要批准",
      summary: "接受编辑（仅 shell 需询问）",
    },
    plan_only: {
      label: "仅规划",
      description: "只读模式 — Claude 可以读取但不能修改文件",
      summary: "仅规划（只读）",
    },
  },
  trustRequiresSandbox: "不可用：这台远程机器不允许此模式。请在实例设置中启用，才能无需确认地运行其工具。",
  rulesUnsupported: "允许和拒绝规则是 Claude Code 特有的。此提供方不会应用它们，因此不予显示：由上方的权限模式决定其工具的行为。",
  trustDowngraded: "“Rock’n roll”模式已被替换为“询问”：这台远程机器不允许该模式。",
} satisfies Translation<'toolPolicy'>
