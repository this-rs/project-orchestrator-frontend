import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'Dịch vụ',
    frontend: 'Giao diện người dùng',
    worker: 'Worker',
    database: 'Cơ sở dữ liệu',
    message_queue: 'Hàng đợi',
    cache: 'Bộ nhớ đệm',
    gateway: 'Cổng',
    external: 'Bên ngoài',
    library: 'Thư viện',
    cli: 'CLI',
    other: 'Khác',
  },
  tiers: {
    entry: 'Điểm vào',
    gateway: 'Cổng',
    services: 'Dịch vụ',
    libraries: 'Thư viện, nhắn tin và bộ nhớ đệm',
    data: 'Dữ liệu và bên ngoài',
    other: 'Khác',
  },
  legend: {
    required: 'Bắt buộc',
    optional: 'Tùy chọn — hệ thống vẫn chạy khi thiếu',
    direction: 'Từ trái sang phải: nơi người dùng vào → dịch vụ → dữ liệu',
    select: 'Chọn một thành phần để xem điều gì sẽ ngừng hoạt động',
  },
  panel: {
    details: 'Chi tiết {name}',
    close: 'Đóng chi tiết',
    optional: 'tùy chọn',
    dependedOnBy: 'Được phụ thuộc bởi ({n})',
    dependsOn: 'Phụ thuộc vào ({n})',
    nothingDependsOnThis: 'Không có gì phụ thuộc vào mục này.',
    dependsOnNothing: 'Không phụ thuộc vào gì.',
    derivedFrom: 'Suy ra từ {source}',
  },
  description: 'Hệ thống như đã xây dựng: các thành phần và mối phụ thuộc giữa chúng.',
  loadFailed: 'Không thể tải kiến trúc',
  emptyTitle: 'Chưa có kiến trúc',
  emptyDescription:
    'Thêm các thành phần (dịch vụ, cơ sở dữ liệu, hàng đợi…) vào không gian làm việc, hoặc nhờ trợ lý vẽ sơ đồ hệ thống.',
  graphLabel: 'Đồ thị kiến trúc',
  outline: 'Dàn ý kiến trúc',
} satisfies Translation<'architecture'>
