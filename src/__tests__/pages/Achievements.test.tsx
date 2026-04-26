import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider, useAppContext } from "../../context/AppContext";
import { useActivityTimeline, useFileStats } from "../../hooks/useStats";
import Achievements from "../../pages/Achievements";
import { createTimeRange } from "../../utils/timeRange";

jest.mock("../../hooks/useStats", () => ({
  useActivityTimeline: jest.fn(),
  useFileStats: jest.fn(),
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

describe("Achievements page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();

    (useActivityTimeline as jest.Mock).mockImplementation((_scope, range) => ({
      data:
        range.fromDate === "2026-04-20"
          ? [
              {
                date: "2026-04-20",
                commits: 6,
                insertions: 120,
                deletions: 220,
                files_touched: 8,
              },
            ]
          : [
              {
                date: "2026-04-13",
                commits: 4,
                insertions: 80,
                deletions: 70,
                files_touched: 6,
              },
            ],
      isLoading: false,
    }));

    (useFileStats as jest.Mock).mockImplementation((_repoId, range) => ({
      data:
        range?.fromDate === "2026-04-20"
          ? [
              {
                file_id: "current-hotspot",
                file_path: "src/app.ts",
                commit_count: 1,
                total_insertions: 20,
                total_deletions: 10,
                unique_authors: 2,
                churn_score: 45,
                co_touch_score: 30,
                first_seen_at: "2026-04-20",
                last_seen_at: "2026-04-26",
              },
              {
                file_id: "current-silo",
                file_path: "src/domain.ts",
                commit_count: 3,
                total_insertions: 30,
                total_deletions: 15,
                unique_authors: 1,
                churn_score: 10,
                co_touch_score: 5,
                first_seen_at: "2026-04-20",
                last_seen_at: "2026-04-26",
              },
            ]
          : [
              {
                file_id: "previous-hotspot-1",
                file_path: "src/app.ts",
                commit_count: 1,
                total_insertions: 30,
                total_deletions: 5,
                unique_authors: 2,
                churn_score: 80,
                co_touch_score: 15,
                first_seen_at: "2026-04-13",
                last_seen_at: "2026-04-19",
              },
              {
                file_id: "previous-hotspot-2",
                file_path: "src/api.ts",
                commit_count: 1,
                total_insertions: 20,
                total_deletions: 4,
                unique_authors: 2,
                churn_score: 60,
                co_touch_score: 20,
                first_seen_at: "2026-04-13",
                last_seen_at: "2026-04-19",
              },
              {
                file_id: "previous-silo-1",
                file_path: "src/domain.ts",
                commit_count: 4,
                total_insertions: 25,
                total_deletions: 8,
                unique_authors: 1,
                churn_score: 15,
                co_touch_score: 5,
                first_seen_at: "2026-04-13",
                last_seen_at: "2026-04-19",
              },
              {
                file_id: "previous-silo-2",
                file_path: "src/store.ts",
                commit_count: 2,
                total_insertions: 16,
                total_deletions: 8,
                unique_authors: 1,
                churn_score: 15,
                co_touch_score: 5,
                first_seen_at: "2026-04-13",
                last_seen_at: "2026-04-19",
              },
              {
                file_id: "previous-volatile",
                file_path: "src/volatile.ts",
                commit_count: 5,
                total_insertions: 40,
                total_deletions: 12,
                unique_authors: 2,
                churn_score: 15,
                co_touch_score: 5,
                first_seen_at: "2026-04-13",
                last_seen_at: "2026-04-19",
              },
            ],
      isLoading: false,
    }));
  });

  it("asks for a repository or workspace when no scope is selected", () => {
    renderWithProviders(<Achievements />);

    expect(
      screen.getByText("Select a repository or workspace in the sidebar."),
    ).toBeInTheDocument();
  });

  it("shows code health achievements and lets the user ignore one", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <>
        <ScopeSetter />
        <Achievements />
      </>,
    );

    expect(
      await screen.findByRole("heading", { name: "Achievements" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hotspot cooled down")).toBeInTheDocument();
    expect(screen.getByText("Knowledge spread")).toBeInTheDocument();
    expect(screen.getByText("Volatility reduced")).toBeInTheDocument();
    expect(screen.getByText("Cleanup week")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /ignore hotspot cooled down/i }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Hotspot cooled down")).not.toBeInTheDocument();
    });
    expect(
      window.localStorage.getItem("gitpulse.achievements.dismissed"),
    ).toContain("hotspot_cooled_down");
  });
});
