import type {
  ActivityTimelineRow,
  DeveloperGlobalRow,
  FileGlobalRow,
} from "../types";

interface DashboardReportInput {
  scopeLabel: string;
  fromDate: string;
  toDate: string;
  developers: DeveloperGlobalRow[];
  activity: ActivityTimelineRow[];
  files: FileGlobalRow[];
}

interface CodeHealthReportInput {
  scopeLabel: string;
  fromDate: string;
  toDate: string;
  files: FileGlobalRow[];
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function formatScore(value: number): string {
  return value.toFixed(1);
}

function periodLabel(fromDate: string, toDate: string): string {
  if (fromDate === "0001-01-01" && toDate === "9999-12-31") {
    return "All time";
  }
  return `${fromDate} to ${toDate}`;
}

function totalsFromActivity(activity: ActivityTimelineRow[]) {
  return activity.reduce(
    (acc, row) => ({
      commits: acc.commits + row.commits,
      insertions: acc.insertions + row.insertions,
      deletions: acc.deletions + row.deletions,
      filesTouched: acc.filesTouched + row.files_touched,
    }),
    {
      commits: 0,
      insertions: 0,
      deletions: 0,
      filesTouched: 0,
    },
  );
}

function hotspotScore(file: FileGlobalRow): number {
  return file.churn_score + file.co_touch_score;
}

function topDevelopersTable(developers: DeveloperGlobalRow[]): string {
  const rows = developers.slice(0, 5).map((developer, index) =>
    [
      index + 1,
      developer.developer_name,
      developer.total_commits,
      `+${formatNumber(developer.total_insertions)}`,
      `-${formatNumber(developer.total_deletions)}`,
    ].join(" | "),
  );

  if (rows.length === 0) return "No developer activity.";

  return [
    "| Rank | Developer | Commits | Insertions | Deletions |",
    "|---:|---|---:|---:|---:|",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n");
}

function topFilesTable(files: FileGlobalRow[]): string {
  const rows = files.slice(0, 5).map((file, index) =>
    [
      index + 1,
      file.file_path,
      file.commit_count,
      file.unique_authors,
      formatScore(hotspotScore(file)),
    ].join(" | "),
  );

  if (rows.length === 0) return "No file activity.";

  return [
    "| Rank | File | Commits | Authors | Hotspot |",
    "|---:|---|---:|---:|---:|",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n");
}

function healthFilesTable(files: FileGlobalRow[]): string {
  const rows = [...files]
    .sort((left, right) => hotspotScore(right) - hotspotScore(left))
    .slice(0, 10)
    .map((file) =>
      [
        file.file_path,
        formatScore(hotspotScore(file)),
        formatScore(file.churn_score),
        formatScore(file.co_touch_score),
        file.unique_authors,
      ].join(" | "),
    );

  if (rows.length === 0) return "No code health file signals.";

  return [
    "| File | Hotspot | Churn | Co-touch | Authors |",
    "|---|---:|---:|---:|---:|",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n");
}

export function buildDashboardMarkdown(input: DashboardReportInput): string {
  const totals = totalsFromActivity(input.activity);

  return [
    "# GitPulse Dashboard Report",
    "",
    `Scope: ${input.scopeLabel}`,
    `Period: ${periodLabel(input.fromDate, input.toDate)}`,
    "",
    "## Activity",
    `- Commits: ${formatNumber(totals.commits)}`,
    `- Insertions: ${formatNumber(totals.insertions)}`,
    `- Deletions: ${formatNumber(totals.deletions)}`,
    `- Files touched: ${formatNumber(totals.filesTouched)}`,
    "",
    "## Top Developers",
    topDevelopersTable(input.developers),
    "",
    "## Top Files",
    topFilesTable(input.files),
    "",
    "_Generated locally by GitPulse._",
    "",
  ].join("\n");
}

export function buildCodeHealthMarkdown(input: CodeHealthReportInput): string {
  const hotspots = input.files.filter((file) => hotspotScore(file) >= 70).length;
  const siloRisks = input.files.filter(
    (file) => file.unique_authors <= 1 && file.commit_count >= 2,
  ).length;
  const volatileFiles = input.files.filter((file) => file.commit_count >= 3).length;

  return [
    "# GitPulse Code Health Report",
    "",
    `Scope: ${input.scopeLabel}`,
    `Period: ${periodLabel(input.fromDate, input.toDate)}`,
    "",
    "## Summary",
    `- Files: ${formatNumber(input.files.length)}`,
    `- Hotspots: ${formatNumber(hotspots)}`,
    `- Silo risks: ${formatNumber(siloRisks)}`,
    `- Volatile files: ${formatNumber(volatileFiles)}`,
    "",
    "## Hot Files",
    healthFilesTable(input.files),
    "",
    "_Generated locally by GitPulse._",
    "",
  ].join("\n");
}
