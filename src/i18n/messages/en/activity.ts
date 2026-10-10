export default {
  status: {
    running: 'Running',
    queued: 'Queued',
    done: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
    ended: 'Ended',
  },
  lifecycle: {
    started: 'Started',
    progress: 'Progress',
    updated: 'Updated',
    finished: 'Finished',
  },
  param: {
    agent: 'Agent',
    workflow: 'Workflow',
    task: 'Task',
    tool: 'Tool',
    model: 'Model',
    exitCode: 'Exit code',
    taskId: 'Task id',
    outputFile: 'Output file',
  },
  title: {
    workflow: 'Workflow',
    shell: 'Background command',
    monitor: 'Monitor',
    agent: 'Sub-agent',
  },
} as const
