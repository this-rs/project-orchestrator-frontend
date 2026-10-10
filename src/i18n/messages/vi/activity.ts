import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: 'Đang chạy',
    queued: 'Đang xếp hàng',
    done: 'Hoàn tất',
    failed: 'Thất bại',
    cancelled: 'Đã hủy',
    ended: 'Đã kết thúc',
  },
  lifecycle: {
    started: 'Đã bắt đầu',
    progress: 'Tiến độ',
    updated: 'Đã cập nhật',
    finished: 'Đã xong',
  },
  param: {
    agent: 'Tác tử',
    workflow: 'Quy trình',
    task: 'Tác vụ',
    tool: 'Công cụ',
    model: 'Mô hình',
    exitCode: 'Mã thoát',
    taskId: 'ID tác vụ',
    outputFile: 'Tệp đầu ra',
  },
  title: {
    workflow: 'Quy trình',
    shell: 'Lệnh chạy nền',
    monitor: 'Giám sát',
    agent: 'Tác tử con',
  },
} satisfies Translation<'activity'>
