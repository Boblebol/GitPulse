import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider, useAppContext } from "../../context/AppContext";
import { useActivityTimeline, useFileStats } from "../../hooks/useStats";
import Watchlists from "../../pages/Watchlists";
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

describe("Watchlists page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();

    (useActivityTimeline as jest.Mock).mockImplementation((_scope, range) => ({
      data:
        range.fromDate === "2026-04-20"
          ? [
              {
                date: "2026-04-20",
                commits: 8,
                insertions: 120,
                deletions: 30,
                files_touched: 12,
              },
            ]
          : [
              {
                date: "2026-04-13",
                commits: 5,
                insertions: 60,
                deletions: 20,
                files_touched: 9,
              },
            ],
      isLoading: false,
    }));

    (useFileStats as jest.Mock).mockImplementation((_repoId, range) => ({
      data:
        range?.fromDate === "2026-04-20"
          ? [
              {
                file_id: "file1",
                file_path: "src/app.ts",
                commit_count: 4,
                total_insertions: 120,
                total_deletions: 30,
                unique_authors: 1,
                churn_score: 75,
                co_touch_score: 10,
                first_seen_at: "2026-04-20",
                last_seen_at: "2026-04-26",
              },
            ]
          : [
              {
                file_id: "file1",
                file_path: "src/app.ts",
                commit_count: 1,
                total_insertions: 60,
                total_deletions: 20,
                unique_authors: 2,
                churn_score: 25,
                co_touch_score: 4,
                first_seen_at: "2026-04-13",
                last_seen_at: "2026-04-19",
              },
            ],
      isLoading: false,
    }));
  });

  it("asks for a repository or workspace when no scope is selected", () => {
    renderWithProviders(<Watchlists />);

    expect(
      screen.getByText("Select a repository or workspace in the sidebar."),
    ).toBeInTheDocument();
  });

  it("adds tracked targets and shows period deltas", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <>
        <ScopeSetter />
        <Watchlists />
      </>,
    );

    expect(await screen.findByText("Watchlists & Compare")).toBeInTheDocument();
    expect(screen.getAllByText("+3")).toHaveLength(2);
    expect(screen.getByText("+70")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Watch type"), "file");
    await user.type(screen.getByLabelText("Target"), "src/app.ts");
    await user.type(screen.getByLabelText("Label"), "App file");
    await user.click(screen.getByRole("button", { name: "Add Watch" }));

    expect(screen.getByText("App file")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(window.localStorage.getItem("gitpulse.watchlist.items")).toContain(
      "src/app.ts",
    );

    await user.click(screen.getByRole("button", { name: /remove app file/i }));

    await waitFor(() => {
      expect(screen.queryByText("App file")).not.toBeInTheDocument();
    });
  });
});
