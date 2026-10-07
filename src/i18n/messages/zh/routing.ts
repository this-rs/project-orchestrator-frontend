import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: '仅主提供方', description: '只有一个独占的主提供方，与现在相同。PO 只记录它本会做出的选择。' },
    mixed: { label: '混合', description: '主提供方主导对话；PO 负责分派执行者。' },
    full: { label: '完全', description: 'PO 决定一切并说明原因。' },
  },
  stages: {
    shadow: { label: '影子', description: '不应用任何决定；每个决定都会被记录。' },
    advisory: { label: '建议', description: 'PO 提出建议，由你确认。' },
    auto: { label: '自动', description: 'PO 直接应用它的决定。' },
  },
  routedBy: {
    session: '为会话选定',
    request: '在请求中选定',
    task: '由任务选定',
    persona: '由角色选定',
    run: '由运行选定',
    project_rule: '项目规则',
    global_rule: '全局规则',
    default: '服务器默认',
    claude_code: 'Claude Code 回退',
    fallback: '回退链',
    auto: 'PO 已选择',
  },
  rejection: {
    not_allowed: '此项目不允许',
    unhealthy: '不健康',
    no_tools: '无法调用工具',
    context_too_small: '上下文窗口过小',
    no_images: '无法读取图片',
    over_budget: '超出预算',
    trust_without_sandbox: '无沙箱的信任模式',
    remote: '远程，此处不允许',
  },
  badge: { poChooses: '由 PO 选择', why: '为什么？' },
  advanced: { force: '强制指定提供方' },
  settings: { title: '路由', confirmAuto: 'PO 之后将不经询问直接应用自己的选择。继续吗？' },
  report: { agreement: '与实际选择的一致率', costDelta: '预估成本差额', unknown: '未知' },
} satisfies Translation<'routing'>
