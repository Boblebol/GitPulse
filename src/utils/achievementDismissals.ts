export const ACHIEVEMENT_DISMISSALS_STORAGE_KEY =
  "gitpulse.achievements.dismissed";

type AchievementDismissalState = Record<string, string[]>;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function readState(): AchievementDismissalState {
  const targetStorage = storage();
  if (!targetStorage) return {};

  try {
    const raw = targetStorage.getItem(ACHIEVEMENT_DISMISSALS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(state: AchievementDismissalState): void {
  const targetStorage = storage();
  if (!targetStorage) return;
  targetStorage.setItem(ACHIEVEMENT_DISMISSALS_STORAGE_KEY, JSON.stringify(state));
}

export function loadDismissedAchievements(bucket: string): string[] {
  return readState()[bucket] ?? [];
}

export function dismissAchievement(bucket: string, achievementKey: string): string[] {
  const state = readState();
  const nextKeys = Array.from(
    new Set([...(state[bucket] ?? []), achievementKey]),
  );

  writeState({
    ...state,
    [bucket]: nextKeys,
  });

  return nextKeys;
}

export function clearDismissedAchievements(bucket: string): string[] {
  const state = readState();
  const nextState = { ...state };
  delete nextState[bucket];
  writeState(nextState);
  return [];
}
