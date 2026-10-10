import type { Translation } from '../../catalog.ts'

export default {
  title: 'Commits',
  empty: '暂无 commit',
  copy: '复制 SHA {sha}',
  copied: '已复制 {sha}',
  files: {
    one: '{count} 个文件',
    other: '{count} 个文件',
  },
  loadingFiles: '正在加载文件…',
  noFiles: '暂无文件详情',
} satisfies Translation<'commits'>
