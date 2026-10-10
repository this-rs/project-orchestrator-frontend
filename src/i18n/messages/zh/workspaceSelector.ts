import type { Translation } from '../../catalog.ts'

export default {
  title: "选择工作区",
  lead: "工作区把共享上下文和目标的项目归在一起。请选择要在其中工作的工作区。",
  notFound: "未找到工作区“{slug}”",
  notFoundBody: "它可能已被删除或重命名。请在下方选择其他工作区。",
  loading: "正在加载工作区",
  errorTitle: "连接错误",
  errorBody: "无法加载工作区。后端是否在运行？",
  create: "创建工作区",
  createSubmit: "创建",
  creating: "正在创建…",
  cancel: "取消",
  nameLabel: "工作区名称",
  namePlaceholder: "我的工作区",
  welcome: "欢迎使用 Project Orchestrator",
  welcomeLead: "创建您的第一个工作区即可开始。",
  createFirst: "创建工作区",
  createFailed: "无法创建工作区",
  updated: "更新于",
  explain: {
    what: "工作区把您共享上下文和目标的多个项目归在一起。",
    why: "打开一个工作区，就能一起看到它的项目、计划、笔记和决策；“今日”会显示所有工作区中等待您处理的事项。",
    different: "不再是每个项目一个互不相通的文件夹，同一工作区的项目共享已做出的决策，因此处理其中一个项目的助手知道其他项目已确定的内容。",
  },
} satisfies Translation<'workspaceSelector'>
