import type { Translation } from '../../catalog.ts'

export default {
  energy: {
    label: "Năng lượng",
    description: "Mức độ hoạt động gần đây của một phần tử. Năng lượng càng cao thì phần tử đó càng được làm việc tích cực.",
  },
  cohesion: {
    label: "Độ gắn kết",
    description: "Thước đo sức mạnh nội tại của một mô-đun hoặc thành phần. Độ gắn kết cao nghĩa là các phần tử của nó liên kết chặt chẽ với nhau.",
  },
  synapse: {
    label: "Synapse",
    description: "Kết nối giữa hai phần tử của dự án (ghi chú, tác vụ, tệp). Biểu thị một quan hệ phụ thuộc hoặc ngữ cảnh.",
  },
  scar: {
    label: "Vết sẹo",
    description: "Dấu vết của một sự cố trong quá khứ. Giúp tránh lặp lại cùng sai lầm bằng cách đánh dấu các vùng mong manh.",
  },
  moat: {
    label: "Hào bảo vệ",
    description: "Hàng rào bảo vệ quanh một thành phần quan trọng. Báo hiệu rằng thay đổi ở đó cần đặc biệt cẩn trọng.",
  },
  spreading_activation: {
    label: "Lan truyền kích hoạt",
    description: "Cơ chế truyền tầm quan trọng của một phần tử sang các phần tử lân cận trong đồ thị, như một làn sóng lan qua mạng lưới.",
  },
  fabric: {
    label: "Mạng tri thức",
    description: "Mạng lưới kiến thức của dự án — tập hợp các kết nối giữa ghi chú, quyết định và mã nguồn.",
  },
  trajectory: {
    label: "Lộ trình",
    description: "Lịch sử đường đi của một tác tử hoặc một tác vụ qua các giai đoạn của dự án.",
  },
  protocol: {
    label: "Giao thức",
    description: "Máy trạng thái hữu hạn mô tả một quy trình làm việc. Xác định các chuyển tiếp hợp lệ giữa các trạng thái.",
  },
  persona: {
    label: "Persona",
    description: "Hồ sơ chuyên biệt được gán cho một tác tử để định hướng hành vi và kỹ năng của nó.",
  },
  episode: {
    label: "Phiên làm việc",
    description: "Một phiên làm việc đã được ghi lại của tác tử, gồm các hành động đã thực hiện và kết quả đạt được.",
  },
  neural_routing: {
    label: "Định tuyến thần kinh",
    description: "Cách phân phối thông minh các tác vụ cho tác tử, dựa trên kỹ năng và khối lượng công việc của họ.",
  },
  milestone: {
    label: "Cột mốc",
    description: "Điểm kiểm tra quan trọng của dự án. Gom các tác vụ lại và đánh dấu một bước tiến then chốt.",
  },
  feature_graph: {
    label: "Đồ thị tính năng",
    description: "Hình ảnh hóa các phụ thuộc giữa những tính năng của dự án, cho thấy tính năng nào phụ thuộc vào tính năng nào.",
  },
  lifecycle_hook: {
    label: "Hook vòng đời",
    description: "Hành động tự động được kích hoạt khi trạng thái thay đổi (VD: một thông báo khi tác vụ chuyển sang 'completed').",
  },
  constraint: {
    label: "Ràng buộc",
    description: "Quy tắc hoặc giới hạn áp dụng cho một tác vụ hoặc một kế hoạch. Phải được tuân thủ thì công việc mới được coi là hợp lệ.",
  },
  decision: {
    label: "Quyết định",
    description: "Lựa chọn về kiến trúc hoặc kỹ thuật được ghi lại cùng ngữ cảnh và lý do, để tham khảo về sau.",
  },
  component: {
    label: "Thành phần",
    description: "Mô-đun chức năng của dự án (backend, frontend, API…) dùng để tổ chức mã nguồn và trách nhiệm.",
  },
  workspace: {
    label: "Không gian làm việc",
    description: "Vùng chứa biệt lập gom các dự án, tác vụ và tài nguyên. Giữ các ngữ cảnh làm việc khác nhau tách biệt.",
  },
  skill: {
    label: "Kỹ năng",
    description: "Năng lực được ghi lại của một tác tử, mô tả nó biết làm gì và ở mức thành thạo nào.",
  },
  release: {
    label: "Bản phát hành",
    description: "Phiên bản đã công bố của dự án, gom một tập thay đổi sẵn sàng đưa vào sản xuất.",
  },
  success_rate: {
    label: "Tỷ lệ thành công",
    description: "Phần trăm tác vụ được persona này hoàn thành thành công. Phản ánh độ tin cậy của nó trên các nhiệm vụ được giao.",
  },
  activation_count: {
    label: "Số lần kích hoạt",
    description: "Số lần một phần tử được kích hoạt (được tác tử sử dụng). Số càng cao thì phần tử càng hay được gọi đến.",
  },
  analysis_profile: {
    label: "Hồ sơ phân tích",
    description: "Cấu hình xác định cách phân tích một dự án: tính những chỉ số nào, áp dụng những ngưỡng nào.",
  },
  co_change: {
    label: "Đồng thay đổi",
    description: "Các tệp thường thay đổi cùng nhau. Đồng thay đổi mạnh gợi ý sự ghép nối (có chủ ý hoặc ngoài ý muốn).",
  },
  coupling: {
    label: "Độ ghép nối",
    description: "Mức độ phụ thuộc giữa hai mô-đun. Độ ghép nối thấp thì dễ bảo trì hơn.",
  },
  churn: {
    label: "Tần suất thay đổi",
    description: "Mức độ thường xuyên một tệp bị sửa đổi. Tần suất cao có thể cho thấy một vùng không ổn định hoặc đang được phát triển tích cực.",
  },
  hotspot: {
    label: "Điểm nóng",
    description: "Tệp phức tạp và thường xuyên bị sửa. Điểm nóng là vùng cần theo dõi vì tập trung rủi ro lỗi.",
  },
  orphan: {
    label: "Tệp mồ côi",
    description: "Tệp không được tệp nào khác nhập vào và cũng không xuất ra cho tệp nào. Có thể là mã chết hoặc một tệp tích hợp kém.",
  },
  dead_note: {
    label: "Ghi chú chết",
    description: "Ghi chú không còn năng lượng — đã lâu không được đọc hay sửa và có lẽ đã lỗi thời.",
  },
  stale_note: {
    label: "Ghi chú đã cũ",
    description: "Ghi chú có nội dung đã lâu chưa được cập nhật và có thể không còn phản ánh đúng tình trạng hiện tại của dự án.",
  },
  god_function: {
    label: "Hàm thần thánh",
    description: "Hàm quá dài hoặc quá phức tạp, làm quá nhiều việc. Nên được tách thành các hàm nhỏ hơn.",
  },
  clustering_coefficient: {
    label: "Hệ số phân cụm",
    description: "Đo mật độ kết nối giữa các nút lân cận của một nút. Hệ số cao cho thấy một nhóm liên kết chặt chẽ với nhau.",
  },
  knowledge_coverage: {
    label: "Độ phủ kiến thức",
    description: "Tỷ lệ giữa số ghi chú/quyết định và số tệp mã nguồn. Cho biết mã nguồn có được tài liệu hóa tốt hay không.",
  },
  note_freshness: {
    label: "Độ mới của ghi chú",
    description: "Tỷ lệ ghi chú vẫn còn cập nhật. Tỷ lệ thấp nghĩa là nhiều ghi chú cần được đọc lại.",
  },
  synapse_quality: {
    label: "Chất lượng synapse",
    description: "Tỷ lệ kết nối vững chắc trong mạng lưới. Synapse yếu là những liên kết thiếu tin cậy giữa các phần tử.",
  },
  skills_maturity: {
    label: "Độ trưởng thành của kỹ năng",
    description: "Tỷ lệ kỹ năng đang hoạt động trên tổng số. Cho biết mức độ thành thạo chung của nhóm đối với dự án.",
  },
  code_safety: {
    label: "An toàn mã nguồn",
    description: "Điểm số dựa trên đánh giá rủi ro. Tính đến các tệp có rủi ro nghiêm trọng và cao, cũng như các lỗ hổng.",
  },
  health_score: {
    label: "Điểm sức khỏe",
    description: "Điểm tổng hợp từ độ phủ kiến thức, độ mới của ghi chú, năng lượng thần kinh, chất lượng synapse và độ trưởng thành của kỹ năng.",
  },
  circular_dependency: {
    label: "Phụ thuộc vòng",
    description: "Tình huống hai mô-đun phụ thuộc lẫn nhau, tạo thành một vòng lặp. Khiến mã nguồn khó bảo trì và khó kiểm thử hơn.",
  },
} satisfies Translation<'glossary'>
