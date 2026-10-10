import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: '运行中',
    queued: '排队中',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
    ended: '已结束',
  },
  lifecycle: {
    started: '已开始',
    progress: '进度',
    updated: '已更新',
    finished: '已完成',
  },
  param: {
    agent: '智能体',
    workflow: '工作流',
    task: '任务',
    tool: '工具',
    model: '模型',
    exitCode: '退出码',
    taskId: '任务 ID',
    outputFile: '输出文件',
  },
  title: {
    workflow: '工作流',
    shell: '后台命令',
    monitor: '监控',
    agent: '子智能体',
  },
} satisfies Translation<'activity'>
