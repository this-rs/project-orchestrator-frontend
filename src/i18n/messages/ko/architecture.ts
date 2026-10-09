import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: '서비스',
    frontend: '프런트엔드',
    worker: '워커',
    database: '데이터베이스',
    message_queue: '큐',
    cache: '캐시',
    gateway: '게이트웨이',
    external: '외부',
    library: '라이브러리',
    cli: 'CLI',
    other: '기타',
  },
  tiers: {
    entry: '진입점',
    gateway: '게이트웨이',
    services: '서비스',
    libraries: '라이브러리, 메시징 및 캐시',
    data: '데이터 및 외부',
    other: '기타',
  },
  legend: {
    required: '필수',
    optional: '선택 — 없어도 시스템이 동작합니다',
    direction: '왼쪽에서 오른쪽으로: 사용자 진입 → 서비스 → 데이터',
    select: '구성 요소를 선택하면 중단될 대상을 볼 수 있습니다',
  },
  panel: {
    details: '{name} 상세 정보',
    close: '상세 정보 닫기',
    optional: '선택',
    dependedOnBy: '이 항목에 의존함 ({n})',
    dependsOn: '의존 대상 ({n})',
    nothingDependsOnThis: '이 항목에 의존하는 것이 없습니다.',
    dependsOnNothing: '의존하는 대상이 없습니다.',
    derivedFrom: '{source}에서 파생됨',
  },
  description: '구축된 시스템: 구성 요소와 의존 관계.',
  loadFailed: '아키텍처를 불러오지 못했습니다',
  emptyTitle: '아직 아키텍처가 없습니다',
  emptyDescription:
    '워크스페이스에 구성 요소(서비스, 데이터베이스, 큐…)를 추가하거나 어시스턴트에게 시스템 매핑을 요청하세요.',
  graphLabel: '아키텍처 그래프',
  outline: '아키텍처 개요',
} satisfies Translation<'architecture'>
