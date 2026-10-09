import type { Translation } from '../../catalog.ts'

export default {
  description: '规划并跟踪实现阶段',
  newPlan: '新建计划',
  searchPlaceholder: '搜索计划…',
  allStatuses: '所有状态',
  project: '项目',
  listLabel: '计划',
  selectPlan: '选择 {title}',
  createdBy: '创建者:{name}',
  loaded: '已加载 {loaded}/{total}',
  count: {
    one: '{count} 个计划',
    other: '{count} 个计划',
  },
  empty: {
    pristineTitle: '暂无计划',
    pristineBody: '创建一个计划来组织你的开发工作。',
    filteredTitle: '没有匹配的计划',
    filteredBody: '请尝试调整搜索或筛选条件。',
  },
  toast: {
    created: '计划已创建',
    updated: '计划已更新',
    deleted: '计划已删除',
    deletedMany: {
      one: '已删除 {count} 个计划',
      other: '已删除 {count} 个计划',
    },
  },
  dialog: {
    create: '创建计划',
    edit: '编辑计划',
  },
  confirm: {
    deleteTitle: '删除计划?',
    deleteBody: '此计划及其所有任务将被永久删除。',
    bulkTitle: {
      one: '删除 {count} 个计划?',
      other: '删除 {count} 个计划?',
    },
    bulkBody: {
      one: '{count} 个计划及其所有任务将被永久删除。',
      other: '{count} 个计划及其所有任务将被永久删除。',
    },
  },
} satisfies Translation<'plans'>
