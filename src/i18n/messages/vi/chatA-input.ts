import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "Đã trả lời:",
    placeholder: "Hoặc nhập câu trả lời của bạn...",
    submit: "Gửi",
    notSent: "Chưa gửi: mất kết nối. Câu trả lời của bạn vẫn được giữ, hãy thử lại sau khi kết nối lại."
  },
  attachments: {
    processing: "Đang xử lý…",
    remove: "Gỡ bỏ",
    removeAria: "Gỡ {name}",
    pendingSend: "Tin nhắn sẽ được gửi khi tải lên hoàn tất"
  },
  upload: {
    network: "Lỗi mạng — tệp chưa bao giờ đến được máy chủ",
    timeout: "Máy chủ không phản hồi kịp — hãy gỡ tệp và thêm lại",
    tooLarge: "Tệp quá lớn",
    unsupported: "Định dạng tệp không được hỗ trợ",
    unreadable: "Không đọc được tệp (sai định dạng hoặc bị hỏng)",
    forbidden: "Không được phép tải lên ở đây",
    failed: "Tải lên thất bại (HTTP {status})"
  },
  action: {
    send: "Gửi tin nhắn",
    stop: "Dừng tạo nội dung",
    stopping: "Đang dừng…",
    waiting: "Đang chờ tệp đính kèm tải lên xong",
    idle: "Gửi tin nhắn",
    removeFailed: "Hãy gỡ tệp đính kèm bị lỗi trước",
    waitingUpload: "Đang chờ tải lên hoàn tất"
  },
  composer: {
    imageName: "hình ảnh",
    alreadyIn: "{label} đã có trong tin nhắn.",
    added: "Đã thêm {label} vào tin nhắn.",
    close: "Đóng",
    maxRefs: "Tối đa {max} tham chiếu cho mỗi tin nhắn: tham chiếu cuối cùng chưa được thêm.",
    references: "Tham chiếu",
    placeholder: "Gửi một tin nhắn...",
    attach: "Đính kèm tệp",
    override: "(ghi đè)",
    default: "mặc định",
    auto: "Tự động",
    autoOn: "Đã bật tự động tiếp tục",
    autoOff: "Đã tắt tự động tiếp tục",
    drop: "Thả để đính kèm"
  }
} satisfies Translation<'chatA-input'>
