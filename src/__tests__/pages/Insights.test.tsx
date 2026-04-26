import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider, useAppContext } from "../../context/AppContext";
import Insights from "../../pages/Insights";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

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

describe("Insights page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (invoke as jest.Mock).mockResolvedValue([
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
      {
        insight_key: "activity_summary",
        category: "activity",
        severity: "info",
        title: "Scoped activity summary",
        summary: "12 commits across 4 active days.",
        entity_label: "Selected scope",
        metric_value: 12,
        action_label: "Open dashboard",
        route: "/",
      },
    ]);
  });

  it("asks for a repository or workspace when no scope is selected", () => {
    renderWithProviders(<Insights />);

    expect(
      screen.getByText("Select a repository or workspace in the sidebar."),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("renders scoped insight cards", async () => {
    renderWithProviders(
      <>
        <ScopeSetter />
        <Insights />
      </>,
    );

    expect(await screen.findByText("Highest activity file")).toBeInTheDocument();
    expect(screen.getByText("Scoped activity summary")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("info")).toBeInTheDocument();
  });
});
