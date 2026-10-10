import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'Mã nguồn', description: 'Tệp, hàm, struct, trait' },
    pm: { label: 'Dự án', description: 'Kế hoạch, tác vụ, mục tiêu' },
    knowledge: { label: 'Tri thức', description: 'Ghi chú, quyết định, ràng buộc' },
    fabric: { label: 'Mạng tri thức', description: 'IMPORTS, CALLS, CO_CHANGED' },
    neural: { label: 'Thần kinh', description: 'Synapse, năng lượng, kích hoạt' },
    skills: { label: 'Kỹ năng', description: 'Các cụm tri thức tự hình thành' },
    behavioral: { label: 'Hành vi', description: 'Giao thức, trạng thái, chuyển tiếp (FSM)' },
    chat: { label: 'Trò chuyện', description: 'Phiên trò chuyện và các thực thể được thảo luận' },
  },
  preset: {
    code_only: { label: 'Mã nguồn', description: 'Kiến trúc mã thuần túy' },
    knowledge_overlay: { label: 'Tri thức', description: 'Ghi chú và quyết định trên mã' },
    neural_view: { label: 'Thần kinh', description: 'Mạng thần kinh, kỹ năng và giao thức' },
    pm_view: { label: 'Dự án', description: 'Kế hoạch, tác vụ, mục tiêu' },
    impact_mode: { label: 'Tác động', description: 'Phân tích tác động' },
    behavioral_view: { label: 'Hành vi', description: 'Giao thức, kỹ năng, ghi chú và các liên kết' },
    full_stack: { label: 'Đầy đủ', description: 'Tất cả các lớp' },
  },
  group: {
    core: 'Lõi',
    code: 'Mã nguồn',
    knowledge: 'Tri thức',
    git: 'Git',
    sessions: 'Phiên',
    features: 'Tính năng',
    behavioral: 'Hành vi',
  },
  scale: { workspace: 'dự án', project: 'kế hoạch + mục tiêu', plan: 'tác vụ', task: 'bước' },
} satisfies Translation<'intelConfig'>
