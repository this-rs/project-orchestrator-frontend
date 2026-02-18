interface TutorialProgressProps {
  currentStep: number
  totalSteps: number
}

/**
 * Segmented horizontal progress bar for guided tours.
 * Shows "Étape X sur Y" label and colored segments.
 */
export function TutorialProgress({ currentStep, totalSteps }: TutorialProgressProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-zinc-400 font-medium">
          Étape {currentStep + 1} sur {totalSteps}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: totalSteps }, (_, i) => {
          let segmentClass = 'bg-zinc-700'
          if (i < currentStep) {
            segmentClass = 'bg-indigo-400/60'
          } else if (i === currentStep) {
            segmentClass = 'bg-indigo-500 animate-pulse'
          }
          return (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${segmentClass}`}
            />
          )
        })}
      </div>
    </div>
  )
}
