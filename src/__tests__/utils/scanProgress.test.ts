import type { ScanProgress } from "../../types";
import {
  formatScanCommitProgress,
  formatScanEta,
  formatScanProgressPercent,
} from "../../utils/scanProgress";

function progress(overrides: Partial<ScanProgress> = {}): ScanProgress {
  return {
    repo_id: "repo1",
    scan_run_id: "scan1",
    status: "running",
    commits_indexed: 42_300,
    files_processed: 9_100,
    cursor_sha: "commit-a",
    target_head_sha: "commit-z",
    ...overrides,
  };
}

describe("scan progress formatting", () => {
  it("formats commit progress with total commits when available", () => {
    expect(
      formatScanCommitProgress(progress({ total_commits: 100_000 })),
    ).toBe("42.3k / 100.0k commits");
  });

  it("falls back to indexed commits when total commits are not available", () => {
    expect(formatScanCommitProgress(progress())).toBe("42.3k commits");
  });

  it("formats bounded progress percentages", () => {
    expect(formatScanProgressPercent(progress({ progress_percent: 42.345 }))).toBe(
      "42.3%",
    );
    expect(formatScanProgressPercent(progress({ progress_percent: 120 }))).toBe(
      "100.0%",
    );
  });

  it("omits invalid progress percentages", () => {
    expect(formatScanProgressPercent(progress())).toBeNull();
    expect(formatScanProgressPercent(progress({ progress_percent: Number.NaN }))).toBeNull();
  });

  it("formats ETA from seconds to minutes and hours", () => {
    expect(formatScanEta(progress({ eta_seconds: 45 }))).toBe("45s");
    expect(formatScanEta(progress({ eta_seconds: 1_200 }))).toBe("20m");
    expect(formatScanEta(progress({ eta_seconds: 7_500 }))).toBe("2h 5m");
  });

  it("omits missing or invalid ETA values", () => {
    expect(formatScanEta(progress())).toBeNull();
    expect(formatScanEta(progress({ eta_seconds: Number.NaN }))).toBeNull();
  });
});
