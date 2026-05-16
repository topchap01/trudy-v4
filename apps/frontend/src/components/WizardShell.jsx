import { useCallback } from 'react'
import Button from './Button.jsx'

/**
 * WizardShell — generic multi-step wizard wrapper.
 *
 * Props:
 *   steps        - Array of { label: string, description?: string }
 *   currentStep  - 0-based index of the active step
 *   onStepChange - (nextIndex: number) => void
 *   children     - content for the current step
 *   canAdvance   - boolean, enables/disables the Next button
 *   onSubmit     - callback fired when the user clicks Submit on the final step
 *   submitLabel  - label for the final-step button (default "Create Campaign")
 *   loading      - shows spinner on Submit button and disables navigation
 */
export default function WizardShell({
  steps = [],
  currentStep = 0,
  onStepChange,
  children,
  canAdvance = true,
  onSubmit,
  submitLabel = 'Create Campaign',
  loading = false,
}) {
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  const handleBack = useCallback(() => {
    if (currentStep > 0) onStepChange?.(currentStep - 1)
  }, [currentStep, onStepChange])

  const handleNext = useCallback(() => {
    if (isLast) {
      onSubmit?.()
    } else {
      onStepChange?.(currentStep + 1)
    }
  }, [currentStep, isLast, onStepChange, onSubmit])

  return (
    <div className="flex flex-col min-h-0 gap-6">
      {/* ── Step indicator ── */}
      <nav aria-label="Wizard progress" className="px-2">
        <ol className="flex items-center w-full">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentStep
            const isActive = idx === currentStep
            const isUpcoming = idx > currentStep

            return (
              <li
                key={idx}
                className="flex items-center flex-1 last:flex-none"
              >
                {/* Circle + label group */}
                <button
                  type="button"
                  onClick={() => {
                    if (isCompleted) onStepChange?.(idx)
                  }}
                  disabled={loading || isUpcoming || isActive}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${idx + 1}: ${step.label}${isCompleted ? ' (completed)' : ''}${isActive ? ' (current)' : ''}`}
                  className="flex flex-col items-center gap-1.5 group disabled:cursor-default"
                >
                  {/* Circle */}
                  <span
                    className={[
                      'flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold border-2 transition-colors',
                      isCompleted
                        ? 'bg-green-600 border-green-600 text-white dark:bg-green-500 dark:border-green-500'
                        : isActive
                          ? 'bg-sky-600 border-sky-600 text-white dark:bg-sky-500 dark:border-sky-500'
                          : 'bg-gray-100 border-gray-300 text-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-500',
                    ].join(' ')}
                  >
                    {isCompleted ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </span>

                  {/* Label + description */}
                  <span className="text-center">
                    <span
                      className={[
                        'block text-xs font-medium leading-tight',
                        isActive
                          ? 'text-sky-700 dark:text-sky-400'
                          : isCompleted
                            ? 'text-green-700 dark:text-green-400 group-hover:underline'
                            : 'text-gray-400 dark:text-gray-500',
                      ].join(' ')}
                    >
                      {step.label}
                    </span>
                    {step.description && (
                      <span className="block text-[10px] text-gray-400 dark:text-gray-500 leading-snug mt-0.5">
                        {step.description}
                      </span>
                    )}
                  </span>
                </button>

                {/* Connecting line (not after last step) */}
                {idx < steps.length - 1 && (
                  <div
                    aria-hidden="true"
                    className={[
                      'flex-1 h-0.5 mx-2 mt-[-1.25rem] rounded-full transition-colors',
                      idx < currentStep
                        ? 'bg-green-500 dark:bg-green-600'
                        : 'bg-gray-200 dark:bg-gray-700',
                    ].join(' ')}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* ── Step content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>

      {/* ── Bottom bar ── */}
      <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={isFirst || loading}
          aria-label="Go to previous step"
        >
          Back
        </Button>

        <Button
          variant="solid"
          onClick={handleNext}
          disabled={!canAdvance || loading}
          loading={isLast && loading}
          aria-label={isLast ? submitLabel : 'Go to next step'}
        >
          {isLast ? submitLabel : 'Next'}
        </Button>
      </div>
    </div>
  )
}
