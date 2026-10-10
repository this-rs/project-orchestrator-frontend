import type { Translation } from '../../catalog.ts'

export default {
  title: 'Commit',
  empty: 'Chưa có commit nào',
  copy: 'Sao chép SHA {sha}',
  copied: 'Đã sao chép {sha}',
  files: {
    one: '{count} tệp',
    other: '{count} tệp',
  },
  loadingFiles: 'Đang tải tệp…',
  noFiles: 'Không có thông tin chi tiết về tệp',
} satisfies Translation<'commits'>
