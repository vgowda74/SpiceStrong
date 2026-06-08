/**
 * bodyAlignmentService.ts
 * Alignment scoring and feedback for guided body scan capture.
 * Note: Expo's CameraView doesn't expose raw frames to JS, so scoring is
 * simulation-based — a realistic ramp that mirrors what pose detection would do.
 */

export type ScanPose = 'front' | 'side';

export interface AlignmentResult {
  isAligned: boolean;
  alignmentScore: number; // 0–100
  feedback: string;
  issues: string[];
}

export function getFeedbackForScore(score: number): string {
  if (score < 30) return 'Move into frame — full body needed';
  if (score < 60) return 'Getting closer — adjust position';
  if (score < 80) return 'Almost there — small adjustment needed';
  return 'Perfect alignment!';
}

export function getIssuesForScore(score: number, pose: ScanPose): string[] {
  if (score < 30) return ['Full body not visible', 'Move back from camera'];
  if (score < 60) return pose === 'front' ? ['Center yourself horizontally'] : ['Turn 90° to camera'];
  if (score < 80) return ['Minor position adjustment needed'];
  return [];
}

export function buildAlignmentResult(score: number, pose: ScanPose): AlignmentResult {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return {
    isAligned: clamped >= 80,
    alignmentScore: clamped,
    feedback: getFeedbackForScore(clamped),
    issues: getIssuesForScore(clamped, pose),
  };
}

/**
 * Simulates a realistic alignment score ramp.
 * Starts ~8–12%, climbs to ~82% after ~9 seconds so audio guidance has
 * enough time to play before the hold countdown begins.
 * Returns the next score given elapsed ms since camera opened.
 */
export function simulateAlignmentScore(elapsedMs: number, previous: number): number {
  // ~9 s to reach 80 — gives audio prompts time to guide the user
  const target = 88;
  const progressRatio = Math.min(1, elapsedMs / 12000);
  const curved = target * (1 - Math.exp(-2.1 * progressRatio));
  const baseScore = 8 + curved;
  // Small natural jitter ±3
  const jitter = (Math.random() - 0.5) * 6;
  const next = baseScore + jitter;
  // Don't drop more than 4 pts from previous (smooth)
  return Math.max(previous - 4, Math.min(100, next));
}
