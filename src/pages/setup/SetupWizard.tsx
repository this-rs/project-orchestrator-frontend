import { useAtomValue } from 'jotai'
import { setupStepAtom } from '@/atoms/setup'
import { SetupLayout } from './SetupLayout'
import { InfrastructurePage } from './InfrastructurePage'
import { AuthPage } from './AuthPage'
import { ChatPage } from './ChatPage'
import { LaunchPage } from './LaunchPage'

const STEP_COMPONENTS = [InfrastructurePage, AuthPage, ChatPage, LaunchPage]

export function SetupWizard() {
  const step = useAtomValue(setupStepAtom)
  const StepComponent = STEP_COMPONENTS[step] || InfrastructurePage

  const isLaunchStep = step === 3

  return (
    <SetupLayout hideNav={isLaunchStep}>
      <StepComponent />
    </SetupLayout>
  )
}
