import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: "Tự duyệt chỉnh sửa",
    ask: "Hỏi",
    plan_only: "Chỉ lập kế hoạch",
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: "Chấp nhận chỉnh sửa",
    ask: "Mặc định",
    plan_only: "Chỉ lập kế hoạch",
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: "Chấp nhận chỉnh sửa",
    ask: "Hỏi quyền",
    plan_only: "Chế độ kế hoạch",
  },
  native: {
    auto: { short: "Tự động", long: "Chế độ tự động" },
    dontAsk: { short: "Không hỏi", long: "Không hỏi" },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: "Tự duyệt mọi công cụ. Không có hộp thoại xác nhận." },
      auto_edits: { label: "Chấp nhận chỉnh sửa", description: "Tự duyệt chỉnh sửa tệp, hỏi trước khi chạy lệnh." },
      ask: { label: "Mặc định", description: "Hỏi trước mỗi lần dùng công cụ." },
      plan_only: { label: "Chỉ lập kế hoạch", description: "Chế độ chỉ đọc. Không ghi tệp hay chạy lệnh." },
    },
    neutral: {
      trust: { description: "Chạy mọi công cụ mà không hỏi." },
      auto_edits: { description: "Chỉnh sửa tệp chạy không cần hỏi; lệnh vẫn phải hỏi." },
      ask: { description: "Hỏi trước mỗi lần gọi công cụ." },
      plan_only: { description: "Chỉ đọc. Không ghi tệp hay chạy lệnh." },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: "Mọi công cụ được tự duyệt — không có hộp thoại xin quyền",
      summary: "Rock'n roll (tự duyệt tất cả)",
    },
    ask: {
      label: "Mặc định",
      description: "Hỏi duyệt cho chỉnh sửa tệp và lệnh shell",
      summary: "Mặc định (hỏi khi chỉnh sửa và shell)",
    },
    auto_edits: {
      label: "Chấp nhận chỉnh sửa",
      description: "Chỉnh sửa tệp được tự duyệt, lệnh shell cần được duyệt",
      summary: "Chấp nhận chỉnh sửa (chỉ hỏi với shell)",
    },
    plan_only: {
      label: "Chỉ lập kế hoạch",
      description: "Chế độ chỉ đọc — Claude có thể đọc nhưng không sửa tệp",
      summary: "Chỉ lập kế hoạch (chỉ đọc)",
    },
  },
  trustRequiresSandbox: "Không khả dụng: máy từ xa này không cho phép chế độ này. Hãy bật nó trong cài đặt của phiên bản để chạy các công cụ mà không cần xác nhận.",
  rulesUnsupported: "Quy tắc cho phép và từ chối là đặc thù của Claude Code. Nhà cung cấp này không áp dụng chúng nên chúng không được hiển thị: chế độ quyền ở trên là thứ điều khiển các công cụ của nó.",
  trustDowngraded: "Chế độ “Rock’n roll” đã được thay bằng “Hỏi”: máy từ xa này không cho phép chế độ đó.",
} satisfies Translation<'toolPolicy'>
