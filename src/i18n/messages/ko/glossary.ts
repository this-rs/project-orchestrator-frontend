import type { Translation } from '../../catalog.ts'

export default {
  energy: {
    label: '에너지',
    description: '요소의 최근 활동 수준입니다. 에너지가 높을수록 그 요소에서 활발히 작업하고 있다는 뜻입니다.',
  },
  cohesion: {
    label: '응집도',
    description: '모듈이나 컴포넌트의 내부 결속력을 나타내는 척도입니다. 응집도가 높으면 구성 요소들이 서로 긴밀하게 연결되어 있습니다.',
  },
  synapse: {
    label: '시냅스',
    description: '프로젝트의 두 요소(노트, 작업, 파일) 사이의 연결입니다. 의존 관계나 맥락 관계를 나타냅니다.',
  },
  scar: {
    label: '흉터',
    description: '과거 문제가 남긴 흔적입니다. 취약한 영역을 표시해 같은 실수를 반복하지 않도록 돕습니다.',
  },
  moat: {
    label: '해자',
    description: '핵심 컴포넌트를 둘러싼 보호 장벽입니다. 그곳의 변경에는 각별한 주의가 필요하다는 신호입니다.',
  },
  spreading_activation: {
    label: '활성화 전파',
    description: '한 요소의 중요도를 그래프의 이웃 요소로 퍼뜨리는 메커니즘으로, 네트워크를 타고 번지는 물결과 같습니다.',
  },
  fabric: {
    label: '패브릭',
    description: '프로젝트의 지식 네트워크로, 노트, 결정, 코드 사이의 연결 전체를 말합니다.',
  },
  trajectory: {
    label: '궤적',
    description: '에이전트나 작업이 프로젝트의 여러 단계를 거쳐 지나온 경로의 이력입니다.',
  },
  protocol: {
    label: '프로토콜',
    description: '워크플로를 설명하는 유한 상태 기계입니다. 상태 사이에서 허용되는 전이를 정의합니다.',
  },
  persona: {
    label: '페르소나',
    description: '에이전트의 행동과 스킬을 이끌기 위해 부여하는 전문화된 프로필입니다.',
  },
  episode: {
    label: '에피소드',
    description: '에이전트의 기록된 작업 세션으로, 수행한 동작과 얻은 결과가 담겨 있습니다.',
  },
  neural_routing: {
    label: '뉴럴 라우팅',
    description: '에이전트의 스킬과 작업량을 바탕으로 작업을 똑똑하게 분배하는 방식입니다.',
  },
  milestone: {
    label: '마일스톤',
    description: '프로젝트의 중요한 이정표입니다. 작업을 묶고 진행의 핵심 단계를 표시합니다.',
  },
  feature_graph: {
    label: '기능 그래프',
    description: '프로젝트 기능 사이의 의존 관계를 시각화해, 어떤 기능이 어떤 기능에 의존하는지 보여 줍니다.',
  },
  lifecycle_hook: {
    label: '수명 주기 훅',
    description: '상태 변경으로 실행되는 자동 동작입니다(예: 작업이 \'completed\'로 바뀔 때 알림).',
  },
  constraint: {
    label: '제약',
    description: '작업이나 플랜에 적용되는 규칙 또는 한계입니다. 작업이 유효하다고 인정받으려면 지켜야 합니다.',
  },
  decision: {
    label: '결정',
    description: '나중에 참고할 수 있도록 맥락과 근거와 함께 기록한 아키텍처 또는 기술적 선택입니다.',
  },
  component: {
    label: '컴포넌트',
    description: '코드와 책임을 정리하는 데 쓰는 프로젝트의 기능 모듈입니다(백엔드, 프런트엔드, API 등).',
  },
  workspace: {
    label: '워크스페이스',
    description: '프로젝트, 작업, 리소스를 묶는 독립된 컨테이너입니다. 서로 다른 작업 맥락을 분리해 둡니다.',
  },
  skill: {
    label: '스킬',
    description: '에이전트가 무엇을 할 수 있고 어느 수준으로 숙달했는지를 기록한 능력입니다.',
  },
  release: {
    label: '릴리스',
    description: '프로젝트의 공개된 버전으로, 운영 반영 준비가 된 변경 묶음입니다.',
  },
  success_rate: {
    label: '성공률',
    description: '이 페르소나가 성공적으로 완료한 작업의 비율입니다. 맡은 임무에서의 신뢰도를 보여 줍니다.',
  },
  activation_count: {
    label: '활성화 횟수',
    description: '요소가 활성화된(에이전트가 사용한) 횟수입니다. 숫자가 높을수록 그 요소가 자주 호출됩니다.',
  },
  analysis_profile: {
    label: '분석 프로필',
    description: '프로젝트를 어떻게 분석할지 정의하는 설정입니다. 어떤 지표를 계산하고 어떤 임계값을 적용할지 정합니다.',
  },
  co_change: {
    label: '동시 변경',
    description: '자주 함께 바뀌는 파일입니다. 동시 변경이 많으면 결합(의도적이든 우연이든)을 시사합니다.',
  },
  coupling: {
    label: '결합도',
    description: '두 모듈 사이의 의존 정도입니다. 유지보수성을 위해서는 결합도가 낮은 편이 좋습니다.',
  },
  churn: {
    label: '변경 빈도',
    description: '파일이 수정되는 빈도입니다. 변경 빈도가 높으면 불안정하거나 활발히 개발 중인 영역일 수 있습니다.',
  },
  hotspot: {
    label: '핫스팟',
    description: '자주 수정되고 복잡한 파일입니다. 버그 위험이 집중되므로 주의해서 살펴볼 영역입니다.',
  },
  orphan: {
    label: '고아 파일',
    description: '다른 파일에서 임포트하지도, 내보내지도 않는 파일입니다. 죽은 코드이거나 제대로 통합되지 않은 파일일 수 있습니다.',
  },
  dead_note: {
    label: '죽은 노트',
    description: '남은 에너지가 없는 노트입니다. 오랫동안 읽히거나 수정되지 않아 폐기되었을 가능성이 큽니다.',
  },
  stale_note: {
    label: '오래된 노트',
    description: '내용이 한동안 업데이트되지 않아 프로젝트의 현재 상태를 더는 반영하지 않을 수 있는 노트입니다.',
  },
  god_function: {
    label: '갓 함수',
    description: '지나치게 길거나 복잡해 너무 많은 일을 하는 함수입니다. 더 작은 함수로 나누는 것이 좋습니다.',
  },
  clustering_coefficient: {
    label: '군집 계수',
    description: '한 노드의 이웃들 사이 연결의 밀도를 측정합니다. 계수가 높으면 촘촘하게 서로 연결된 집단이라는 뜻입니다.',
  },
  knowledge_coverage: {
    label: '지식 커버리지',
    description: '노트와 결정의 수를 코드 파일의 수로 나눈 비율입니다. 코드가 잘 문서화되어 있는지 보여 줍니다.',
  },
  note_freshness: {
    label: '노트 최신도',
    description: '여전히 최신인 노트의 비율입니다. 비율이 낮으면 다시 읽어야 할 노트가 많다는 뜻입니다.',
  },
  synapse_quality: {
    label: '시냅스 품질',
    description: '네트워크에서 탄탄한 연결이 차지하는 비율입니다. 약한 시냅스는 요소 사이의 믿을 수 없는 연결입니다.',
  },
  skills_maturity: {
    label: '스킬 성숙도',
    description: '전체 스킬 중 활성 스킬의 비율입니다. 프로젝트에 대한 팀의 전반적인 숙련 수준을 나타냅니다.',
  },
  code_safety: {
    label: '코드 안전성',
    description: '위험 평가를 바탕으로 한 점수입니다. 치명적이거나 위험도가 높은 파일과 취약점을 반영합니다.',
  },
  health_score: {
    label: '건강 점수',
    description: '지식 커버리지, 노트 최신도, 뉴럴 에너지, 시냅스 품질, 스킬 성숙도를 합친 종합 점수입니다.',
  },
  circular_dependency: {
    label: '순환 의존성',
    description: '두 모듈이 서로에게 의존해 고리가 생기는 상황입니다. 코드를 유지보수하고 테스트하기 어렵게 만듭니다.',
  },
} satisfies Translation<'glossary'>
