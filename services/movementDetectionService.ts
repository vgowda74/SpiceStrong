/**
 * movementDetectionService.ts
 * Movement detection for guided body scan capture.
 * Without raw frame access in Expo's CameraView, stability is determined by
 * a hold-duration timer with a random small chance of simulated micro-movement.
 */

export interface MovementCheckResult {
  captured: boolean;
  hadMovement: boolean;
  retryNeeded: boolean;
}

/**
 * Simulates movement probability during a hold window.
 * First 500 ms grace period, then monitors.
 * Returns true if movement (capture should retry).
 */
export function simulateMovementDuringCapture(elapsedHoldMs: number): boolean {
  if (elapsedHoldMs < 500) return false; // grace
  // ~12% chance of a movement event per check — realistic jitter
  return Math.random() < 0.12;
}

/**
 * Returns whether the hold has been stable long enough to capture.
 * holdDurationMs: how long score has been >= 80
 * requiredMs: how long we need stability (default 2000 ms)
 */
export function isStableEnoughToCapture(holdDurationMs: number, requiredMs = 2000): boolean {
  return holdDurationMs >= requiredMs;
}

/**
 * Builds a movement check result after a capture attempt.
 */
export function buildMovementCheckResult(hadMovement: boolean): MovementCheckResult {
  return {
    captured: !hadMovement,
    hadMovement,
    retryNeeded: hadMovement,
  };
}
