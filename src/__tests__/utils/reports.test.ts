import {
  buildCodeHealthMarkdown,
  buildDashboardMarkdown,
} from "../../utils/reports";
import type {
  ActivityTimelineRow,
  DeveloperGlobalRow,
  FileGlobalRow,
} from "../../types";

const developers: DeveloperGlobalRow[] = [
  {
    developer_id: "dev1",
    developer_name: "Ada",
    total_commits: 8,
    total_insertions: 120,
    total_deletions: 40,
    files_touched: 12,
    active_days: 4,
    longest_streak: 3,
    avg_commit_size: 20,
    first_commit_at: "2026-04-20",
    last_commit_at: "2026-04-26",
  },
  {
    developer_id: "dev2",
    developer_name: "Linus",
    total_commits: 5,
    total_insertions: 60,
    total_deletions: 20,
    files_touched: 7,
    active_days: 3,
    longest_streak: 2,
    avg_commit_size: 16,
    first_commit_at: "2026-04-21",
    last_commit_at: "2026-04-25",
  },
];

const activity: ActivityTimelineRow[] = [
  {
    date: "2026-04-20",
    commits: 8,
    insertions: 120,
    deletions: 40,
    files_touched: 12,
  },
  {
    date: "2026-04-21",
    commits: 5,
    insertions: 60,
    deletions: 20,
    files_touched: 7,
  },
];

const files: FileGlobalRow[] = [
  {
    file_id: "file1",
    file_path: "src/app.ts",
    commit_count: 4,
    total_insertions: 100,
    total_deletions: 20,
    unique_authors: 1,
    churn_score: 75,
    co_touch_score: 10,
    first_seen_at: "2026-04-20",
    last_seen_at: "2026-04-26",
  },
  {
    file_id: "file2",
    file_path: "src/utils.ts",
    commit_count: 2,
    total_insertions: 30,
    total_deletions: 10,
    unique_authors: 3,
    churn_score: 20,
    co_touch_score: 4,
    first_seen_at: "2026-04-21",
    last_seen_at: "2026-04-24",
  },
];

describe("Markdown report serializers", () => {
  it("builds deterministic dashboard markdown without local paths", () => {
    const markdown = buildDashboardMarkdown({
      scopeLabel: "Repository",
      fromDate: "2026-04-20",
      toDate: "2026-04-26",
      developers,
      activity,
      files,
    });

    expect(markdown).toContain("# GitPulse Dashboard Report");
    expect(markdown).toContain("Scope: Repository");
    expect(markdown).toContain("Period: 2026-04-20 to 2026-04-26");
    expect(markdown).toContain("- Commits: 13");
    expect(markdown).toContain("| 1 | Ada | 8 | +120 | -40 |");
    expect(markdown).toContain("| 1 | src/app.ts | 4 | 1 | 85.0 |");
    expect(markdown).toContain("_Generated locally by GitPulse._");
    expect(markdown).not.toContain("/Users/");
  });

  it("builds deterministic code health markdown", () => {
    const markdown = buildCodeHealthMarkdown({
      scopeLabel: "Repository",
      fromDate: "2026-04-20",
      toDate: "2026-04-26",
      files,
    });

    expect(markdown).toContain("# GitPulse Code Health Report");
    expect(markdown).toContain("- Hotspots: 1");
    expect(markdown).toContain("- Silo risks: 1");
    expect(markdown).toContain("| src/app.ts | 85.0 | 75.0 | 10.0 | 1 |");
    expect(markdown).toContain("_Generated locally by GitPulse._");
  });
});
