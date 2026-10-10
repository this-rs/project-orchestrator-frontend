import type { Translation } from '../../catalog.ts'

export default {
  back: "Quay lại",
  settings: {
    title: "Cài đặt",
    description: "Cài đặt ứng dụng máy tính. Chúng áp dụng cho mọi cuộc trò chuyện với trợ lý.",
    chatTitle: "Chat & AI",
    chatDescription: "Chế độ quyền, công cụ được phép và bị từ chối, biến môi trường và CLI Claude Code mà các trợ lý sử dụng.",
    updatesTitle: "Cập nhật",
    updatesDescription: "Kiểm tra phiên bản mới của ứng dụng máy tính và cài đặt.",
    providersNote: "Nhà cung cấp (phiên bản, đồng ý theo dự án, vai trò và chính sách mô hình) có trang riêng:",
    providersLink: "Nhà cung cấp → /providers",
    explain: {
      what: "Cài đặt là các lựa chọn của chính ứng dụng máy tính: trợ lý được phép làm gì trên máy này và ứng dụng cập nhật ra sao.",
      why: "Bạn quyết định một lần: trợ lý được chạy gì, dùng công cụ nào và bạn đang dùng phiên bản nào.",
      different: "Hiện nay các lựa chọn này nằm rải rác trong tệp cấu hình và cờ terminal. Ở đây chúng gom về một màn hình, áp dụng cho mọi cuộc trò chuyện.",
    },
  },
  providers: {
    title: "Nhà cung cấp",
    description: "Cuộc trò chuyện của bạn chạy ở đâu, mỗi dự án được gửi gì đến đó và mô hình nào làm việc gì.",
    explain: {
      what: "Bạn chọn AI: Claude Code có sẵn, và bạn có thể đăng ký nhà cung cấp khác rồi cho phép theo từng dự án.",
      why: "Bạn chọn nhà cung cấp và mô hình cho từng cuộc trò chuyện, và khóa không bao giờ được nhập vào biểu mẫu: nó nằm trong kho khóa.",
      different: "Hiện nay một công cụ đồng nghĩa một mô hình. Ở đây cuộc trò chuyện giữ nguyên nhà cung cấp của nó, và trợ lý giao việc có thể chỉ định nhà cung cấp và mô hình cho việc đó.",
    },
  },
} satisfies Translation<'settingsPage'>
