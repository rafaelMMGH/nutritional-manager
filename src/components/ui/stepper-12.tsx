import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

type Stepper12Step = {
  label: string
}

type Stepper12Props = {
  steps: Stepper12Step[]
  currentStep: number
  className?: string
}

function Stepper12({ steps, currentStep, className }: Stepper12Props) {
  return (
    <nav
      aria-label="Progreso de creacion del plan"
      data-slot="stepper-12"
      className={cn("w-full overflow-x-auto pb-1", className)}
    >
      <ol className="flex min-w-max items-start rounded-lg border border-border bg-muted/30 px-3 py-3">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep

          return (
            <li key={step.label} className="group/step relative flex min-w-[94px] flex-1 flex-col items-center gap-2 px-2">
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0 top-4 h-px w-1/2 bg-border",
                    index <= currentStep && "bg-primary"
                  )}
                />
              )}
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute right-0 top-4 h-px w-1/2 bg-border",
                    index < currentStep && "bg-primary"
                  )}
                />
              )}
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "relative z-10 flex size-8 items-center justify-center rounded-full border bg-background text-xs font-semibold text-muted-foreground transition-colors",
                  isCompleted && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/15"
                )}
              >
                {isCompleted ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={cn(
                  "max-w-[88px] text-center text-[11px] font-medium leading-tight text-muted-foreground",
                  (isCompleted || isCurrent) && "text-foreground"
                )}
              >
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { Stepper12, type Stepper12Step }
