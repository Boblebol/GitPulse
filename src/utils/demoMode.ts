export const DEMO_MODE_ENABLED_KEY = "gitpulse.demoMode.enabled";

function getStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

export function isDemoModeEnabled(storage?: Storage): boolean {
  return getStorage(storage)?.getItem(DEMO_MODE_ENABLED_KEY) === "true";
}

export function markDemoModeEnabled(storage?: Storage): void {
  getStorage(storage)?.setItem(DEMO_MODE_ENABLED_KEY, "true");
}

export function clearDemoModeEnabled(storage?: Storage): void {
  getStorage(storage)?.removeItem(DEMO_MODE_ENABLED_KEY);
}
