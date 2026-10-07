import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'Chỉ chính', description: 'Chỉ một nhà cung cấp chính độc quyền, như hiện nay. PO chỉ ghi lại điều nó sẽ chọn.' },
    mixed: { label: 'Hỗn hợp', description: 'Nhà cung cấp chính dẫn dắt cuộc trò chuyện; PO điều phối các bên thực thi.' },
    full: { label: 'Toàn phần', description: 'PO chọn mọi thứ và giải thích lý do.' },
  },
  stages: {
    shadow: { label: 'Ghi nhận', description: 'Không áp dụng gì cả; mọi quyết định đều được ghi lại.' },
    advisory: { label: 'Tư vấn', description: 'PO đề xuất; bạn xác nhận.' },
    auto: { label: 'Tự động', description: 'PO áp dụng các quyết định của mình.' },
  },
  routedBy: {
    session: 'Được chọn cho phiên',
    request: 'Được chọn trong yêu cầu',
    task: 'Được chọn bởi tác vụ',
    persona: 'Được chọn bởi persona',
    run: 'Được chọn bởi lượt chạy',
    project_rule: 'Quy tắc dự án',
    global_rule: 'Quy tắc chung',
    default: 'Mặc định của máy chủ',
    claude_code: 'Dự phòng Claude Code',
    fallback: 'Chuỗi dự phòng',
    auto: 'PO đã chọn',
  },
  rejection: {
    not_allowed: 'Không được phép cho dự án này',
    unhealthy: 'Không ổn định',
    no_tools: 'Không gọi được công cụ',
    context_too_small: 'Cửa sổ ngữ cảnh quá nhỏ',
    no_images: 'Không đọc được ảnh',
    over_budget: 'Vượt ngân sách',
    trust_without_sandbox: 'Chế độ tin cậy không có sandbox',
    remote: 'Từ xa, không được phép ở đây',
  },
  badge: { poChooses: 'PO chọn', why: 'Vì sao?' },
  advanced: { force: 'Nâng cao: buộc dùng một nhà cung cấp/mô hình cho cuộc trò chuyện này' },
  picker: { primary: 'Chính: {target} · PO định tuyến các bên thực thi', forced: 'Đã buộc: {target}', willChoose: 'PO sẽ chọn ở tin nhắn đầu tiên', routedBy: 'Định tuyến bởi: {by}', aria: 'Định tuyến: {mode}' },
  reason: 'Lý do: {reason}',
  settings: { title: 'Định tuyến', confirmAuto: 'Từ giờ PO sẽ áp dụng lựa chọn của mình mà không hỏi. Tiếp tục?' },
  report: { agreement: 'Mức trùng khớp với lựa chọn thực tế', costDelta: 'Chênh lệch chi phí ước tính', unknown: 'Không rõ' },
} satisfies Translation<'routing'>
