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
 * Reaches ~80 in ~5-6 s — fast enough to not frustrate side-view users
 * who can't see the screen while turned sideways.
 */
export function simulateAlignmentScore(elapsedMs: number, previous: number): number {
  const target = 88;
  const progressRatio = Math.min(1, elapsedMs / 6000);
  const curved = target * (1 - Math.exp(-2.1 * progressRatio));
  const baseScore = 8 + curved;
  const jitter = (Math.random() - 0.5) * 4;
  const next = baseScore + jitter;
  return Math.max(previous - 2, Math.min(100, next));
}
