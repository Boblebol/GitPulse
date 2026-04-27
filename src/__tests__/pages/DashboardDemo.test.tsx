import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "../../pages/Dashboard";
import { AppProvider, useAppContext } from "../../context/AppContext";

jest.mock("../../hooks/useStats", () => ({
  useActivityTimeline: jest.fn(() => ({ data: [] })),
  useDeveloperGlobalStats: jest.fn(() => ({ data: [], isLoading: false })),
  useFileStats: jest.fn(() => ({ data: [], isLoading: false })),
}));

jest.mock("../../hooks/useRepos", () => ({
  usePauseScan: jest.fn(() => ({ isPending: false, mutate: jest.fn() })),
  useResumeScan: jest.fn(() => ({ isPending: false, mutate: jest.fn() })),
  useScanStatus: jest.fn(() => ({ data: null })),
  useTriggerScan: jest.fn(() => ({
    data: null,
    error: null,
    isError: false,
    isPending: false,
    isSuccess: false,
    mutate: jest.fn(),
  })),
}));

jest.mock("../../components/ActivityChart", () => ({
  __esModule: true,
  default: ({ data }: { data: Array<{ date: string; value: number }> }) => (
    <div data-testid="activity-chart">{data.length} demo points</div>
  ),
}));

function DemoControls() {
  const { enableDemoMode, disableDemoMode } = useAppContext();

  return (
    <div>
      <button onClick={enableDemoMode}>Enable Demo</button>
      <button onClick={disableDemoMode}>Disable Demo</button>
    </div>
  );
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <DemoControls />
        <Dashboard />
      </AppProvider>
    </QueryClientProvider>,
  );
}

describe("Dashboard demo mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows sample dashboard data when demo mode is enabled", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(
      screen.getByText(/select a workspace and repository.*try the demo first/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enable Demo" }));

    await waitFor(() => {
      expect(screen.getByText("Demo Mode")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Ari Maintainer").length).toBeGreaterThan(0);
    expect(screen.getByText("src/analytics/health.ts")).toBeInTheDocument();
    expect(screen.getByTestId("activity-chart")).toHaveTextContent("7 demo points");
  });

  it("returns to the empty dashboard when demo mode is disabled", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("gitpulse.demoMode.enabled", "true");

    renderDashboard();

    expect(screen.getByText("Demo Mode")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disable Demo" }));

    await waitFor(() => {
      expect(
        screen.getByText(/select a workspace and repository.*try the demo first/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryAllByText("Ari Maintainer")).toHaveLength(0);
  });
});
