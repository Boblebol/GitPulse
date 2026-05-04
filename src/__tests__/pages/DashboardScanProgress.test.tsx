import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider, useAppContext } from "../../context/AppContext";
import Dashboard from "../../pages/Dashboard";

jest.mock("../../hooks/useStats", () => ({
  useActivityTimeline: jest.fn(() => ({ data: [] })),
  useDeveloperGlobalStats: jest.fn(() => ({ data: [], isLoading: false })),
  useFileStats: jest.fn(() => ({ data: [], isLoading: false })),
}));

jest.mock("../../hooks/useRepos", () => ({
  usePauseScan: jest.fn(() => ({ isPending: false, mutate: jest.fn() })),
  useResumeScan: jest.fn(() => ({ isPending: false, mutate: jest.fn() })),
  useScanStatus: jest.fn(() => ({
    data: {
      repo_id: "repo1",
      scan_run_id: "scan1",
      status: "running",
      commits_indexed: 42_300,
      files_processed: 9_100,
      total_commits: 100_000,
      progress_percent: 42.3,
      elapsed_seconds: 600,
      eta_seconds: 1_200,
      cursor_sha: "commit-a",
      target_head_sha: "commit-z",
      message: "Scan batch persisted",
    },
  })),
  useTriggerScan: jest.fn(() => ({
    data: null,
    error: null,
    isError: false,
    isPending: false,
    isSuccess: false,
    mutate: jest.fn(),
  })),
}));

jest.mock("../../hooks/useInsights", () => ({
  useInsights: jest.fn(() => ({ data: [], isLoading: false })),
}));

jest.mock("../../components/ActivityChart", () => ({
  __esModule: true,
  default: () => <div data-testid="activity-chart" />,
}));

function ScopeSetter() {
  const { setWorkspaceId, setRepoId } = useAppContext();

  useEffect(() => {
    setWorkspaceId("workspace1");
    setRepoId("repo1");
  }, [setRepoId, setWorkspaceId]);

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

describe("Dashboard scan progress", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows total commits, percent, and ETA when scan estimates are available", async () => {
    renderWithProviders(
      <>
        <ScopeSetter />
        <Dashboard />
      </>,
    );

    const status = await screen.findByRole("status");

    expect(status).toHaveTextContent("42.3%");
    expect(status).toHaveTextContent("42.3k / 100.0k commits");
    expect(status).toHaveTextContent("ETA 20m");
  });
});
