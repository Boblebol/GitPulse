import type { ScanProgress } from "../types";

function formatCompactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function formatScanCommitProgress(progress: ScanProgress): string {
  if (progress.total_commits != null) {
    return `${formatCompactCount(progress.commits_indexed)} / ${formatCompactCount(
      progress.total_commits,
    )} commits`;
  }

  return `${formatCompactCount(progress.commits_indexed)} commits`;
}

export function formatScanProgressPercent(progress: ScanProgress): string | null {
  if (progress.progress_percent == null || !Number.isFinite(progress.progress_percent)) {
    return null;
  }

  const percent = Math.max(0, Math.min(100, progress.progress_percent));
  return `${percent.toFixed(1)}%`;
}

export function formatScanEta(progress: ScanProgress): string | null {
  if (progress.eta_seconds == null || !Number.isFinite(progress.eta_seconds)) {
    return null;
  }

  const seconds = Math.max(0, Math.round(progress.eta_seconds));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
