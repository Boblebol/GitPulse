import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider, useAppContext } from "../../context/AppContext";
import { useWeeklyRecap } from "../../hooks/useWeeklyRecap";
import {
  useActivityTimeline,
  useDeveloperGlobalStats,
  useFileStats,
} from "../../hooks/useStats";
import Reports from "../../pages/Reports";
import { createTimeRange } from "../../utils/timeRange";

jest.mock("../../hooks/useStats", () => ({
  useActivityTimeline: jest.fn(),
  useDeveloperGlobalStats: jest.fn(),
  useFileStats: jest.fn(),
}));

jest.mock("../../hooks/useWeeklyRecap", () => ({
  useWeeklyRecap: jest.fn(),
}));

function ScopeSetter() {
  const { setWorkspaceId, setRepoId, setTimeRange } = useAppContext();

  useEffect(() => {
    setWorkspaceId("workspace1");
    setRepoId("repo1");
    setTimeRange(createTimeRange("week", "2026-04-26"));
  }, []);

  return null;
}

function renderWithProviders(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AppProvider>{children}</AppProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("Reports page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    (useDeveloperGlobalStats as jest.Mock).mockReturnValue({
      data: [
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
      ],
      isLoading: false,
    });
    (useActivityTimeline as jest.Mock).mockReturnValue({
      data: [
        {
          date: "2026-04-20",
          commits: 8,
          insertions: 120,
          deletions: 40,
          files_touched: 12,
        },
      ],
      isLoading: false,
    });
    (useFileStats as jest.Mock).mockReturnValue({
      data: [
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
      ],
      isLoading: false,
    });
    (useWeeklyRecap as jest.Mock).mockReturnValue({
      data: {
        week_start: "2026-04-20",
        week_end: "2026-04-26",
        scope_label: "Repository",
        commits: 8,
        insertions: 120,
        deletions: 40,
        active_days: 4,
        top_developer_name: "Ada",
        top_developer_commits: 8,
        top_file_path: "src/app.ts",
        top_file_commits: 4,
        top_insight_title: "Highest activity file",
        top_insight_severity: "high",
        markdown: "# GitPulse Weekly Recap\n\nWeek: 2026-04-20 to 2026-04-26\n",
      },
      isLoading: false,
    });
  });

  it("asks for a repository or workspace when no scope is selected", () => {
    renderWithProviders(<Reports />);

    expect(
      screen.getByText("Select a repository or workspace in the sidebar."),
    ).toBeInTheDocument();
  });

  it("renders dashboard markdown and copies it", async () => {
    renderWithProviders(
      <>
        <ScopeSetter />
        <Reports />
      </>,
    );

    expect(await screen.findByText("Reports")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Report markdown") as HTMLTextAreaElement).value,
    ).toContain("# GitPulse Dashboard Report");
    expect(
      (screen.getByLabelText("Report markdown") as HTMLTextAreaElement).value,
    ).toContain("| 1 | Ada | 8 | +120 | -40 |");

    fireEvent.click(screen.getByRole("button", { name: /copy markdown/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("# GitPulse Dashboard Report"),
      );
    });
  });

  it("switches to weekly recap markdown", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <>
        <ScopeSetter />
        <Reports />
      </>,
    );

    await user.selectOptions(screen.getByLabelText("Report type"), "weekly");

    expect(
      (screen.getByLabelText("Report markdown") as HTMLTextAreaElement).value,
    ).toContain("# GitPulse Weekly Recap");
  });
});
