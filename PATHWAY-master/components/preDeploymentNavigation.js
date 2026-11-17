// Step numbers revisit reached screens; normal Continue actions advance the workflow.
export function canOpenPreDeploymentStep(step, active, reached = active) {
  return Number.isInteger(step) && step >= 1 && step <= Math.min(4, reached) && step !== active;
}
