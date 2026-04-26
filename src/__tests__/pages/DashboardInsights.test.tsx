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

jest.mock("../../hooks/useInsights", () => ({
  useInsights: jest.fn(() => ({
    data: [
      {
        insight_key: "top_hotspot",
        category: "hotspot",
        severity: "high",
        title: "Highest activity file",
        summary: "src/app.ts has high churn.",
        entity_label: "src/app.ts",
        metric_value: 88,
        action_label: "Review file health",
        route: "/health",
      },
    ],
    isLoading: false,
  })),
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

describe("Dashboard insights preview", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows a compact insights preview for the selected scope", async () => {
    renderWithProviders(
      <>
        <ScopeSetter />
        <Dashboard />
      </>,
    );

    expect(await screen.findByText("Insights Preview")).toBeInTheDocument();
    expect(screen.getByText("Highest activity file")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Insights" })).toHaveAttribute(
      "href",
      "/insights",
    );
  });
});
