import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider, useAppContext } from "../../context/AppContext";
import { useWeeklyRecap } from "../../hooks/useWeeklyRecap";
import WeeklyRecap from "../../pages/WeeklyRecap";
import type { WeeklyRecap as WeeklyRecapData } from "../../types";

jest.mock("../../hooks/useWeeklyRecap", () => ({
  useWeeklyRecap: jest.fn(),
}));

const recap: WeeklyRecapData = {
  week_start: "2026-04-20",
  week_end: "2026-04-26",
  scope_label: "Repository",
  commits: 12,
  insertions: 420,
  deletions: 110,
  active_days: 5,
  top_developer_name: "Ada",
  top_developer_commits: 6,
  top_file_path: "src/app.ts",
  top_file_commits: 4,
  top_insight_title: "Highest activity file",
  top_insight_severity: "high",
  markdown: "# GitPulse Weekly Recap\n\nWeek: 2026-04-20 to 2026-04-26\n",
};

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

describe("WeeklyRecap page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWeeklyRecap as jest.Mock).mockReturnValue({
      data: recap,
      isLoading: false,
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("asks for a repository or workspace when no scope is selected", () => {
    renderWithProviders(<WeeklyRecap />);

    expect(
      screen.getByText("Select a repository or workspace in the sidebar."),
    ).toBeInTheDocument();
  });

  it("renders a scoped weekly recap with copyable markdown", async () => {
    renderWithProviders(
      <>
        <ScopeSetter />
        <WeeklyRecap />
      </>,
    );

    expect(await screen.findByText("Weekly Recap")).toBeInTheDocument();
    expect(screen.getByText("2026-04-20 to 2026-04-26")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByLabelText("Weekly recap markdown")).toHaveValue(
      recap.markdown,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy markdown/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(recap.markdown);
    });
  });
});
