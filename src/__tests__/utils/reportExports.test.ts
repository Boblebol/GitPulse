import {
  buildReportCsv,
  buildReportPdfBytes,
  buildReportPptxBytes,
  reportExportFilename,
  type ReportExportInput,
} from "../../utils/reportExports";

const input: ReportExportInput = {
  reportType: "dashboard",
  reportLabel: "Dashboard",
  scopeLabel: "Repository",
  fromDate: "2026-04-20",
  toDate: "2026-04-26",
  markdown: "# GitPulse Dashboard Report\n\n## Activity\n- Commits: 13\n",
  developers: [
    {
      developer_id: "dev1",
      developer_name: 'Ada "Main"',
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
  ],
  activity: [
    {
      date: "2026-04-20",
      commits: 8,
      insertions: 120,
      deletions: 40,
      files_touched: 12,
    },
  ],
  files: [
    {
      file_id: "file1",
      file_path: "src/app,core.ts",
      commit_count: 4,
      total_insertions: 100,
      total_deletions: 20,
      unique_authors: 1,
      churn_score: 75,
      co_touch_score: 10,
      first_seen_at: "2026-04-20",
      last_seen_at: "2026-04-26",
    },
  ],
  weeklyRecap: null,
};

describe("report export serializers", () => {
  it("builds structured CSV rows with proper escaping", () => {
    const csv = buildReportCsv(input);

    expect(csv).toContain("section,metric,value,extra");
    expect(csv).toContain('meta,report,Dashboard,');
    expect(csv).toContain('developer,"Ada ""Main""",8,120 insertions / 40 deletions');
    expect(csv).toContain('file,"src/app,core.ts",4,85.0 hotspot');
  });

  it("builds a PDF byte stream with the report title", () => {
    const pdf = buildReportPdfBytes(input);
    const text = new TextDecoder().decode(pdf);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("GitPulse Dashboard Report");
    expect(text).toContain("%%EOF");
  });

  it("builds a PPTX archive with presentation parts", () => {
    const pptx = buildReportPptxBytes(input);
    const text = new TextDecoder().decode(pptx);

    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("ppt/presentation.xml");
    expect(text).toContain("ppt/slides/slide1.xml");
    expect(text).toContain("GitPulse Dashboard Report");
  });

  it("creates stable export filenames", () => {
    expect(reportExportFilename(input, "csv")).toBe(
      "gitpulse-dashboard-2026-04-20-2026-04-26.csv",
    );
  });
});
