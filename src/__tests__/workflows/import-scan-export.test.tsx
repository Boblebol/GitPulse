import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider, useAppContext } from "../../context/AppContext";
import { useWeeklyRecap } from "../../hooks/useWeeklyRecap";
import {
  useActivityTimeline,
  useDeveloperGlobalStats,
  useFileStats,
  useUpdateFormula,
} from "../../hooks/useStats";
import Reports from "../../pages/Reports";
import Settings from "../../pages/Settings";
import { createTimeRange } from "../../utils/timeRange";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

jest.mock("@tauri-apps/plugin-dialog", () => ({
  open: jest.fn(),
}));

jest.mock("../../hooks/useStats", () => ({
  useActivityTimeline: jest.fn(),
  useDeveloperGlobalStats: jest.fn(),
  useFileStats: jest.fn(),
  useUpdateFormula: jest.fn(),
}));

jest.mock("../../hooks/useWeeklyRecap", () => ({
  useWeeklyRecap: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const workspace = {
  id: "workspace1",
  name: "Product",
  created_at: "2026-05-02T10:00:00Z",
};

const repo = {
  id: "repo-api",
  workspace_id: workspace.id,
  name: "api",
  path: "/projects/api",
  active_branch: "main",
  last_indexed_commit_sha: null,
  created_at: "2026-05-02T10:00:01Z",
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderSettings(queryClient = createQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <Settings />
      </AppProvider>
    </QueryClientProvider>,
  );
}

function ScopeSetter() {
  const { setWorkspaceId, setRepoId, setTimeRange } = useAppContext();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setWorkspaceId(workspace.id);
    setRepoId(repo.id);
    setTimeRange(createTimeRange("week", "2026-04-26"));
  }, [setRepoId, setTimeRange, setWorkspaceId]);

  return null;
}

function renderReports(children: ReactNode) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <AppProvider>{children}</AppProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("import, scan, rebuild, and export workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
    (open as jest.Mock).mockResolvedValue(["/projects"]);
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
    (useUpdateFormula as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    });
  });

  it("keeps the core workspace flow connected across import, scan, rebuild, and reports", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    let reposImported = false;
    const downloads: string[] = [];
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = jest.fn().mockReturnValue("blob:report");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function clickDownload(this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    (invoke as jest.Mock).mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "list_workspaces") return Promise.resolve([workspace]);
      if (command === "list_repos") return Promise.resolve(reposImported ? [repo] : []);
      if (command === "discover_repo_import_candidates") {
        expect(args).toEqual({ paths: ["/projects"] });
        return Promise.resolve([
          {
            path: repo.path,
            name: repo.name,
            branch: repo.active_branch,
            already_exists: false,
          },
        ]);
      }
      if (command === "add_repos") {
        reposImported = true;
        return Promise.resolve({ added: [repo], failed: [] });
      }
      if (command === "list_repo_branches") return Promise.resolve(["main"]);
      if (command === "trigger_scan") return Promise.resolve({ commits_added: 8, files_processed: 4 });
      if (command === "rebuild_aggregates") {
        return Promise.resolve({
          started_at: "2026-05-02T10:00:00Z",
          completed_at: "2026-05-02T10:00:01Z",
          status: "completed",
        });
      }
      return Promise.resolve([]);
    });

    const { unmount } = renderSettings();

    await user.click(await screen.findByText("Product"));
    await user.click(screen.getByRole("button", { name: /browse folders/i }));
    await screen.findByText(repo.path);
    await user.click(screen.getByRole("button", { name: /import 1 repos/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("add_repos", {
        workspaceId: workspace.id,
        repos: [{ path: repo.path, name: repo.name, branch: repo.active_branch }],
      });
    });

    await user.click(await screen.findByRole("button", { name: /sync/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("trigger_scan", { repoId: repo.id });
    });

    await user.click(screen.getByRole("button", { name: /rebuild analytics/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("rebuild_aggregates");
    });

    unmount();

    renderReports(
      <>
        <ScopeSetter />
        <Reports />
      </>,
    );

    await user.click(await screen.findByRole("button", { name: /copy markdown/i }));
    await user.click(screen.getByRole("button", { name: /export csv/i }));
    await user.click(screen.getByRole("button", { name: /export pdf/i }));
    await user.click(screen.getByRole("button", { name: /export pptx/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("# GitPulse Dashboard Report"),
      );
    });
    expect(downloads).toEqual([
      "gitpulse-dashboard-2026-04-20-2026-04-26.csv",
      "gitpulse-dashboard-2026-04-20-2026-04-26.pdf",
      "gitpulse-dashboard-2026-04-20-2026-04-26.pptx",
    ]);

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
    click.mockRestore();
  });
});
