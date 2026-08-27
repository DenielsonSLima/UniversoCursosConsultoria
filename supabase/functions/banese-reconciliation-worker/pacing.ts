const QUERY_DEADLINE_MS = 40_000;
const HARD_DEADLINE_MS = 50_000;
const QUERY_RESERVE_MS = 8_000;
const MAX_LAUNCH_WINDOW_MS = 30_000;
const LAUNCH_DRIFT_MARGIN_MS = 2_000;
const MAX_TARGET_TITLES = 375;

export type BaneseLaunchPacing = Readonly<{
  processingStartedAt: number;
  queryDeadline: number;
  hardDeadline: number;
  launchDeadline: number;
  launchIntervalMs: number;
  targetTitles: number;
}>;

export const createLaunchPacing = (
  startedAt: number,
  processingStartedAt: number,
  targetTitles: number,
): BaneseLaunchPacing => {
  const normalizedTarget = Number.isFinite(targetTitles)
    ? Math.trunc(targetTitles)
    : 1;
  const boundedTarget = Math.max(
    1,
    Math.min(MAX_TARGET_TITLES, normalizedTarget),
  );
  const queryDeadline = startedAt + QUERY_DEADLINE_MS;
  const hardDeadline = startedAt + HARD_DEADLINE_MS;
  const launchWindowMs = Math.max(
    0,
    Math.min(
      MAX_LAUNCH_WINDOW_MS,
      queryDeadline - processingStartedAt - QUERY_RESERVE_MS,
    ),
  );
  const launchMarginMs = Math.min(
    LAUNCH_DRIFT_MARGIN_MS,
    Math.max(0, Math.floor(launchWindowMs / 2)),
  );
  const pacedWindowMs = launchWindowMs - launchMarginMs;
  const launchIntervalMs = boundedTarget <= 1 || pacedWindowMs <= 0
    ? 0
    : Math.max(1, Math.floor(pacedWindowMs / boundedTarget));

  return {
    processingStartedAt,
    queryDeadline,
    hardDeadline,
    launchDeadline: processingStartedAt + launchWindowMs,
    launchIntervalMs,
    targetTitles: boundedTarget,
  };
};

export const scheduledLaunchAt = (
  pacing: BaneseLaunchPacing,
  index: number,
) => pacing.processingStartedAt + Math.max(0, index) * pacing.launchIntervalMs;

export const canLaunchAt = (
  pacing: BaneseLaunchPacing,
  now: number,
) => now < pacing.launchDeadline;
