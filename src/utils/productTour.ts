export const PRODUCT_TOUR_DISMISSED_KEY = "gitpulse.productTour.dismissed";

function getStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

export function hasDismissedProductTour(storage?: Storage): boolean {
  return getStorage(storage)?.getItem(PRODUCT_TOUR_DISMISSED_KEY) === "true";
}

export function markProductTourDismissed(storage?: Storage): void {
  getStorage(storage)?.setItem(PRODUCT_TOUR_DISMISSED_KEY, "true");
}

export function resetProductTourDismissed(storage?: Storage): void {
  getStorage(storage)?.removeItem(PRODUCT_TOUR_DISMISSED_KEY);
}
