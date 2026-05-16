/**
 * Progress bar for "Run All Phases" showing step completion.
 * Props:
 *   steps: string[] — phase names in order
 *   currentStep: string — currently running phase name (or '' if idle)
 *   completedSteps: string[] — phases already completed
 *   failedSteps: string[] — phases that failed
 *   running: boolean — whether the run-all is active
 */
export default function PhaseProgressBar({ steps = [], currentStep = '', completedSteps = [], failedSteps = [], running = false }) {
  if (!running && !completedSteps.length) return null

  const total = steps.length
  const done = completedSteps.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="w-full space-y-2" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="Phase progress">
      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-500 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map((step) => {
          const isComplete = completedSteps.includes(step)
          const isFailed = failedSteps.includes(step)
          const isCurrent = step === currentStep

          let dotClass = 'bg-gray-300 dark:bg-gray-600' // pending
          let textClass = 'text-gray-400 dark:text-gray-500'
          if (isComplete) {
            dotClass = 'bg-green-500'
            textClass = 'text-green-700 dark:text-green-400'
          } else if (isFailed) {
            dotClass = 'bg-red-500'
            textClass = 'text-red-700 dark:text-red-400'
          } else if (isCurrent) {
            dotClass = 'bg-sky-500 animate-pulse'
            textClass = 'text-sky-700 dark:text-sky-300 font-medium'
          }

          return (
            <span key={step} className={`inline-flex items-center gap-1 text-[11px] ${textClass}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
              {step}
              {isCurrent && running && <span className="sr-only">(running)</span>}
            </span>
          )
        })}
      </div>

      {/* Status text */}
      {running && currentStep && (
        <p className="text-xs text-sky-600 dark:text-sky-400" aria-live="polite">
          Running {currentStep}... ({done}/{total} complete)
        </p>
      )}
      {!running && done === total && (
        <p className="text-xs text-green-600 dark:text-green-400" aria-live="polite">
          All phases complete ({failedSteps.length ? `${failedSteps.length} failed` : 'no errors'})
        </p>
      )}
    </div>
  )
}
