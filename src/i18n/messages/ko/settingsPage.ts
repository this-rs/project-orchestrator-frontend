import type { Translation } from '../../catalog.ts'

export default {
  back: "뒤로",
  settings: {
    title: "설정",
    description: "데스크톱 앱 설정입니다. 어시스턴트와의 모든 대화에 적용됩니다.",
    chatTitle: "채팅 및 AI",
    chatDescription: "권한 모드, 허용 및 거부된 도구, 환경 변수, 어시스턴트가 사용하는 Claude Code CLI.",
    updatesTitle: "업데이트",
    updatesDescription: "데스크톱 앱의 새 버전을 확인하고 설치합니다.",
    providersNote: "제공자(인스턴스, 프로젝트 동의, 역할, 모델 정책)는 별도 페이지가 있습니다:",
    providersLink: "제공자 → /providers",
    explain: {
      what: "설정은 데스크톱 앱 자체의 선택 사항입니다. 어시스턴트가 이 컴퓨터에서 어떻게 동작할 수 있는지, 앱이 어떻게 업데이트되는지를 정합니다.",
      why: "어시스턴트가 무엇을 실행할 수 있는지, 어떤 도구를 쓸 수 있는지, 어떤 버전을 쓰는지를 한 번에 정합니다.",
      different: "지금은 이런 선택이 설정 파일과 터미널 플래그에 흩어져 있습니다. 여기서는 한 화면에 모여 모든 대화에 적용됩니다.",
    },
  },
  providers: {
    title: "제공자",
    description: "대화가 어디서 실행되는지, 각 프로젝트가 무엇을 보낼 수 있는지, 어떤 모델이 무엇을 하는지.",
    explain: {
      what: "AI를 직접 선택합니다. Claude Code가 내장되어 있고, 다른 제공자를 등록해 프로젝트별로 허용할 수 있습니다.",
      why: "대화마다 제공자와 모델을 고르며, 키는 양식에 입력하지 않고 볼트에 보관됩니다.",
      different: "지금은 도구 하나에 모델 하나입니다. 여기서는 대화가 자기 제공자에 머물고, 작업을 위임하는 어시스턴트가 그 작업의 제공자와 모델을 지정할 수 있습니다.",
    },
  },
} satisfies Translation<'settingsPage'>
