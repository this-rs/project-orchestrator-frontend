import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "运行",
    workflow: "工作流",
    agent: "智能体",
    shell: "Shell",
    monitor: "监视器"
  },
  kindCount: {
    run: {
      one: "{count} 个运行",
      many: "{count} 个运行"
    },
    workflow: {
      one: "{count} 个工作流",
      many: "{count} 个工作流"
    },
    agent: {
      one: "{count} 个智能体",
      many: "{count} 个智能体"
    },
    shell: {
      one: "{count} 个 Shell",
      many: "{count} 个 Shell"
    },
    monitor: {
      one: "{count} 个监视器",
      many: "{count} 个监视器"
    }
  },
  row: {
    progress: "{settled}/{total} 个智能体",
    stopping: "正在停止…",
    stoppingTitle: "正在停止…",
    stop: "停止",
    stopAria: "停止 {title}",
    stopRun: "停止此运行",
    show: "在对话中显示",
    showAria: "在对话中显示 {title}",
    openConversation: "打开其对话",
    openConversationAria: "打开 {title} 的对话",
    dashboard: "打开 Runner 仪表板",
    dashboardAria: "打开 {title} 的 Runner 仪表板"
  },
  bar: {
    tooFast: "取消过于频繁——请稍后再试。",
    cancelFailed: "取消任务失败——请改用全局停止。",
    runningAria: "运行中：{summary}",
    stoppedOne: "已停止 {count} 个子进程。",
    stoppedMany: "已停止 {count} 个子进程。",
    noPid: "已登记取消，但子进程的 PID 未知——若仍有信号到达，请使用全局停止按钮。"
  },
  agent: {
    subAgent: "子智能体",
    toolOne: "{count} 个工具",
    toolMany: "{count} 个工具",
    running: "{count} 个运行中",
    runningIndicator: "智能体运行中..."
  },
  status: {
    spawning: "启动中",
    running: "运行中",
    verifying: "验证中",
    completed: "已完成",
    failed: "失败",
    interrupted: "已中断"
  },
  banner: {
    elapsed: "已用时",
    cost: "费用",
    ram: "内存（常驻）",
    cpu: "CPU",
    pidTitle: "PID {pid} · {threads} 个线程 · {status}",
    viewAgent: "查看此智能体的对话",
    view: "查看",
    interrupt: "中断此智能体",
    runTitle: "运行 {id}",
    runShort: "运行 {id}",
    wave: "第 {wave} 波",
    openDashboard: "打开完整的 Runner 仪表板",
    dashboard: "仪表板",
    spawning: "正在启动智能体…",
    noAgents: "没有活动的智能体",
    title: "智能体模式",
    activeOne: "{count} 个运行进行中",
    activeMany: "{count} 个运行进行中",
    cumulative: "累计 {cost}"
  },
  pill: {
    title: "智能体模式",
    state: {
      idle: "空闲",
      ready: "就绪",
      running: "运行中",
      completed: "已完成"
    },
    workingOne: "智能体模式 — {count} 个智能体工作中",
    workingMany: "智能体模式 — {count} 个智能体工作中",
    completedOne: "智能体模式 — {count} 个运行已完成",
    completedMany: "智能体模式 — {count} 个运行已完成",
    ready: "智能体模式 — 就绪",
    streamingOne: "当前有 {count} 个运行正在流式传输。下方横幅实时显示智能体。",
    streamingMany: "当前有 {count} 个运行正在流式传输。下方横幅实时显示智能体。",
    more: "另有 {count} 个",
    readyNote: "此聊天已关联计划，但当前没有正在流式传输的运行。",
    ranOne: "此聊天已启动 {count} 个运行，当前没有正在流式传输的运行。",
    ranMany: "此聊天已启动 {count} 个运行，当前没有正在流式传输的运行。",
    openDashboard: "打开 Runner 仪表板"
  },
  bg: {
    title: "后台活动",
    listAria: "后台活动列表",
    summary: {
      running: "{count} 个运行中",
      queued: "{count} 个排队中",
      failed: "{count} 个失败",
      done: "{count} 个完成",
      cancelled: "{count} 个已取消",
      ended: "{count} 个已结束"
    }
  },
  card: {
    showMore: "显示更多",
    showLess: "显示更少",
    lineOne: "{count} 行",
    lineMany: "{count} 行",
    earlierLineOne: "显示更早的 {count} 行",
    earlierLineMany: "显示更早的 {count} 行",
    progressOf: "{title} 的进度",
    agents: "{settled}/{total} 个智能体",
    agentsOf: "{title} 的智能体",
    tokens: "{count} 个 token",
    toolUseOne: "{count} 次工具调用",
    toolUseMany: "{count} 次工具调用",
    timeline: "时间线",
    eventOne: "{count} 个事件",
    eventMany: "{count} 个事件",
    eventsOf: "{title} 的事件",
    hiddenEventOne: "… 更早的 {count} 个事件未保留",
    hiddenEventMany: "… 更早的 {count} 个事件未保留",
    rawPayload: "原始载荷",
    parameters: "参数",
    latestOutput: "最新输出",
    output: "输出",
    kind: {
      workflow: "工作流",
      shell: "后台命令",
      monitor: "监视器",
      agent: "子智能体",
      generic: "后台活动"
    },
    status: {
      running: "运行中",
      queued: "排队中",
      done: "完成",
      failed: "失败",
      cancelled: "已取消",
      ended: "已结束"
    }
  },
  runs: {
    finished: "已结束",
    view: "查看运行",
    stop: "停止运行",
    loading: "正在加载执行记录…",
    noDetails: "没有可用的执行详情。",
    inProgressOne: "{count} 个运行进行中",
    inProgressMany: "{count} 个运行进行中",
    completedOne: "{count} 个运行已完成",
    completedMany: "{count} 个运行已完成",
    done: "{count} 个完成"
  }
} satisfies Translation<'chatA-activity'>
