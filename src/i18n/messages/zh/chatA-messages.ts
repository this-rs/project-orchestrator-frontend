import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "复制为 Markdown",
    copied: "已复制！",
    popupTitle: "消息 Markdown"
  },
  compact: {
    label: "上下文已压缩",
    trigger: {
      auto: "自动",
      manual: "手动"
    },
    tokens: "约 {count}K 个 token"
  },
  continued: {
    label: "已继续",
    afterOne: "{count} 轮后",
    afterMany: "{count} 轮后"
  },
  bubble: {
    references: "引用",
    attachments: "附件",
    copyMessage: "将消息复制为 Markdown",
    copyReply: "将回复复制为 Markdown",
    thinking: "思考中..."
  },
  list: {
    loading: "正在加载消息...",
    loadingOlder: "正在加载更早的消息...",
    beginning: "— 对话开始 —",
    loadingNewer: "正在加载更新的消息...",
    scrollMore: "— 向下滚动查看更多 —",
    catchingUp: "正在追赶…",
    newActivity: "新活动 ↓"
  },
  compaction: {
    label: "正在压缩上下文"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "你想做什么？",
    quickActions: "快捷操作",
    selectProject: "请在上方选择项目以使用快捷操作",
    projectStatus: "项目状态",
    activePlanOne: "{count} 个活动计划",
    activePlanMany: "{count} 个活动计划",
    toReview: "{count} 个待复核",
    allClear: "一切就绪",
    notesOne: "{count} 条笔记",
    notesMany: "{count} 条笔记",
    synced: "{when}同步",
    untitled: "无标题",
    untitledConversation: "无标题对话",
    recent: "最近的对话",
    actions: {
      next: {
        label: "下一个任务",
        description: "获取下一个可用任务",
        prompt: "活动计划中下一个可用的任务是什么？请告诉我它的上下文和步骤。"
      },
      plan: {
        label: "规划一些事情",
        description: "规划一项实现",
        prompt: "规划以下内容的实现："
      },
      impact: {
        label: "影响分析",
        description: "分析变更的影响",
        prompt: "分析更改以下内容的影响："
      },
      arch: {
        label: "架构",
        description: "代码库概览",
        prompt: "请给我项目架构的概览"
      },
      search: {
        label: "代码搜索",
        description: "在代码库中搜索",
        prompt: "在代码中搜索："
      },
      roadmap: {
        label: "路线图",
        description: "里程碑与发布",
        prompt: "请给我展示包含里程碑和发布的完整路线图"
      }
    },
    time: {
      now: "刚刚",
      minutes: "{count} 分钟前",
      hours: "{count} 小时前",
      days: "{count} 天前",
      months: "{count} 个月前"
    },
    plan: {
      draft: "草稿",
      approved: "已批准",
      in_progress: "进行中",
      completed: "已完成",
      cancelled: "已取消"
    }
  },
  panel: {
    connected: "已连接",
    reconnecting: "正在重新连接…",
    disconnected: "已断开",
    connectionLost: "连接已断开",
    exportTitle: "聊天导出",
    newChatTitle: "新聊天",
    chatTitle: "聊天",
    conversations: "对话",
    newConversation: "新对话",
    backToChat: "返回聊天",
    sessions: "会话",
    newChat: "新聊天",
    assistantTree: "助手树",
    permissionSettings: "权限设置",
    copied: "已复制！",
    copyChat: "将聊天复制为 Markdown",
    exitFullscreen: "退出全屏",
    close: "关闭",
    backToParent: "返回上级",
    actions: "对话操作",
    attach: "关联到计划或任务…",
    hideTree: "隐藏助手树",
    showTree: "显示助手树",
    fullscreen: "全屏",
    noProjectsTitle: "暂无项目",
    noProjectsBody: "向此工作区添加项目，即可开始与 Claude 对话。",
    addProject: "添加项目"
  }
} satisfies Translation<'chatA-messages'>
