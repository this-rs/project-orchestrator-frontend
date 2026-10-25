import type { Translation } from '../../catalog.ts'

export default {
  aria: 'Cho phép tác vụ chạy trong thư mục này',
  title: 'Chạy trong thư mục này?',
  hint: 'Không có gì bắt đầu cho đến khi bạn trả lời. Chỉ bạn mới có thể cho phép.',
  allow: 'Cho phép',
  reject: 'Từ chối',
  state: {
    confirmed: 'Đã xác nhận: tác vụ đang bắt đầu.',
    rejected: 'Đã từ chối: không có gì được chạy.',
    expired: 'Đã hết hạn: hãy yêu cầu ủy quyền lại.',
  },
  error: {
    forbidden: 'Chỉ chủ sở hữu của yêu cầu này mới có thể trả lời.',
    conflict: 'Yêu cầu này đã được trả lời hoặc không còn khớp.',
    other: 'Không thể gửi câu trả lời',
  },
} satisfies Translation<'execConfirm'>
