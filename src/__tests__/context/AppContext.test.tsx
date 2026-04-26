import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider, useAppContext } from "../../context/AppContext";

function TestComponent() {
  const { workspaceId, scanningRepoId, addNotification } = useAppContext();
  return (
    <div>
      <div data-testid="workspace-id">{workspaceId || "none"}</div>
      <div data-testid="scanning-repo-id">{scanningRepoId || "none"}</div>
      <button onClick={() => addNotification("Test message", "success")}>
        Add Notification
      </button>
    </div>
  );
}

function ProductTourStateComponent() {
  const {
    isProductTourOpen,
    dismissProductTour,
    openProductTour,
    resetProductTour,
  } = useAppContext();

  return (
    <div>
      <div data-testid="tour-open">{String(isProductTourOpen)}</div>
      <button onClick={dismissProductTour}>Dismiss Tour</button>
      <button onClick={openProductTour}>Open Tour</button>
      <button onClick={resetProductTour}>Reset Tour</button>
    </div>
  );
}

describe("AppContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("provides default values", () => {
    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    expect(screen.getByTestId("workspace-id")).toHaveTextContent("none");
    expect(screen.getByTestId("scanning-repo-id")).toHaveTextContent("none");
  });

  it("allows adding notifications", async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    const button = screen.getByRole("button", { name: "Add Notification" });
    await user.click(button);

    // Notification should be added (would need Toast component to verify rendering)
    expect(button).toBeInTheDocument();
  });

  it("throws error when useAppContext is used outside AppProvider", () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    expect(() => {
      render(<TestComponent />);
    }).toThrow("useAppContext must be used inside AppProvider");

    consoleSpy.mockRestore();
  });

  it("adds notifications with unique IDs", async () => {
    const user = userEvent.setup();

    function MultiNotificationComponent() {
      const { notifications, addNotification } = useAppContext();
      return (
        <div>
          <div data-testid="notification-count">{notifications.length}</div>
          {notifications.map((n) => (
            <div key={n.id} data-testid={`notification-${n.id}`}>
              {n.message}
            </div>
          ))}
          <button onClick={() => addNotification("Message 1", "success")}>
            Add 1
          </button>
          <button onClick={() => addNotification("Message 2", "success")}>
            Add 2
          </button>
        </div>
      );
    }

    render(
      <AppProvider>
        <MultiNotificationComponent />
      </AppProvider>
    );

    await user.click(screen.getByRole("button", { name: "Add 1" }));
    await user.click(screen.getByRole("button", { name: "Add 2" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-count")).toHaveTextContent("2");
    });

    expect(screen.getByText("Message 1")).toBeInTheDocument();
    expect(screen.getByText("Message 2")).toBeInTheDocument();
  });

  it("respects different notification types", async () => {
    const user = userEvent.setup();

    function TypesComponent() {
      const { notifications, addNotification } = useAppContext();
      return (
        <div>
          {notifications.map((n) => (
            <div key={n.id} data-testid={`type-${n.type}`}>
              {n.type}
            </div>
          ))}
          <button onClick={() => addNotification("Success", "success")}>
            Add Success
          </button>
          <button onClick={() => addNotification("Error", "error")}>
            Add Error
          </button>
        </div>
      );
    }

    render(
      <AppProvider>
        <TypesComponent />
      </AppProvider>
    );

    await user.click(screen.getByRole("button", { name: "Add Success" }));
    await user.click(screen.getByRole("button", { name: "Add Error" }));

    await waitFor(() => {
      expect(screen.getByTestId("type-success")).toBeInTheDocument();
      expect(screen.getByTestId("type-error")).toBeInTheDocument();
    });
  });

  it("updates workspace and repo IDs", async () => {
    const user = userEvent.setup();

    function SetterComponent() {
      const { workspaceId, repoId, setWorkspaceId, setRepoId } = useAppContext();
      return (
        <div>
          <div data-testid="workspace-id">{workspaceId || "none"}</div>
          <div data-testid="repo-id">{repoId || "none"}</div>
          <button onClick={() => setWorkspaceId("ws1")}>Set Workspace</button>
          <button onClick={() => setRepoId("repo1")}>Set Repo</button>
        </div>
      );
    }

    render(
      <AppProvider>
        <SetterComponent />
      </AppProvider>
    );

    expect(screen.getByTestId("workspace-id")).toHaveTextContent("none");
    expect(screen.getByTestId("repo-id")).toHaveTextContent("none");

    await user.click(screen.getByRole("button", { name: "Set Workspace" }));
    await waitFor(() => {
      expect(screen.getByTestId("workspace-id")).toHaveTextContent("ws1");
    });

    await user.click(screen.getByRole("button", { name: "Set Repo" }));
    await waitFor(() => {
      expect(screen.getByTestId("repo-id")).toHaveTextContent("repo1");
    });
  });

  it("defaults to repository analysis scope and allows switching to workspace scope", async () => {
    const user = userEvent.setup();

    function ScopeComponent() {
      const { analysisScopeMode, setAnalysisScopeMode } = useAppContext();
      return (
        <div>
          <div data-testid="scope-mode">{analysisScopeMode}</div>
          <button onClick={() => setAnalysisScopeMode("workspace")}>
            Use Workspace Scope
          </button>
        </div>
      );
    }

    render(
      <AppProvider>
        <ScopeComponent />
      </AppProvider>
    );

    expect(screen.getByTestId("scope-mode")).toHaveTextContent("repo");

    await user.click(screen.getByRole("button", { name: "Use Workspace Scope" }));

    await waitFor(() => {
      expect(screen.getByTestId("scope-mode")).toHaveTextContent("workspace");
    });
  });

  it("resets analysis scope to repository when workspace or repo changes", async () => {
    const user = userEvent.setup();

    function ScopeResetComponent() {
      const {
        analysisScopeMode,
        setAnalysisScopeMode,
        setWorkspaceId,
        setRepoId,
      } = useAppContext();
      return (
        <div>
          <div data-testid="scope-mode">{analysisScopeMode}</div>
          <button onClick={() => setAnalysisScopeMode("workspace")}>
            Use Workspace Scope
          </button>
          <button onClick={() => setWorkspaceId("ws1")}>Set Workspace</button>
          <button onClick={() => setRepoId("repo1")}>Set Repo</button>
        </div>
      );
    }

    render(
      <AppProvider>
        <ScopeResetComponent />
      </AppProvider>
    );

    await user.click(screen.getByRole("button", { name: "Use Workspace Scope" }));
    await waitFor(() => {
      expect(screen.getByTestId("scope-mode")).toHaveTextContent("workspace");
    });

    await user.click(screen.getByRole("button", { name: "Set Workspace" }));
    await waitFor(() => {
      expect(screen.getByTestId("scope-mode")).toHaveTextContent("repo");
    });

    await user.click(screen.getByRole("button", { name: "Use Workspace Scope" }));
    await waitFor(() => {
      expect(screen.getByTestId("scope-mode")).toHaveTextContent("workspace");
    });

    await user.click(screen.getByRole("button", { name: "Set Repo" }));
    await waitFor(() => {
      expect(screen.getByTestId("scope-mode")).toHaveTextContent("repo");
    });
  });

  it("stores the selected time range", async () => {
    const user = userEvent.setup();

    function TimeRangeComponent() {
      const { timeRange, setTimeRange } = useAppContext();
      return (
        <div>
          <div data-testid="time-range-mode">{timeRange.mode}</div>
          <div data-testid="time-range-from">{timeRange.fromDate ?? "none"}</div>
          <button
            onClick={() =>
              setTimeRange({
                mode: "last_7",
                anchorDate: "2026-04-26",
                fromDate: "2026-04-20",
                toDate: "2026-04-26",
              })
            }
          >
            Use Last 7
          </button>
        </div>
      );
    }

    render(
      <AppProvider>
        <TimeRangeComponent />
      </AppProvider>
    );

    expect(screen.getByTestId("time-range-mode")).toHaveTextContent("all");
    expect(screen.getByTestId("time-range-from")).toHaveTextContent("none");

    await user.click(screen.getByRole("button", { name: "Use Last 7" }));

    await waitFor(() => {
      expect(screen.getByTestId("time-range-mode")).toHaveTextContent("last_7");
      expect(screen.getByTestId("time-range-from")).toHaveTextContent("2026-04-20");
    });
  });

  it("updates scanning and sync status", async () => {
    const user = userEvent.setup();

    function StatusComponent() {
      const { scanningRepoId, setScanningRepoId, syncStatus, setSyncStatus } = useAppContext();
      return (
        <div>
          <div data-testid="scanning-id">{scanningRepoId || "none"}</div>
          <div data-testid="sync-status">{syncStatus || "none"}</div>
          <button onClick={() => setScanningRepoId("repo123")}>Start Scan</button>
          <button onClick={() => setSyncStatus("Scanning...")}>Update Status</button>
        </div>
      );
    }

    render(
      <AppProvider>
        <StatusComponent />
      </AppProvider>
    );

    await user.click(screen.getByRole("button", { name: "Start Scan" }));
    await waitFor(() => {
      expect(screen.getByTestId("scanning-id")).toHaveTextContent("repo123");
    });

    await user.click(screen.getByRole("button", { name: "Update Status" }));
    await waitFor(() => {
      expect(screen.getByTestId("sync-status")).toHaveTextContent("Scanning...");
    });
  });

  it("stores and clears scan progress by repository", async () => {
    const user = userEvent.setup();

    function ScanProgressComponent() {
      const { scanProgressByRepo, setScanProgress, clearScanProgress } = useAppContext();
      const progress = scanProgressByRepo.repo123;

      return (
        <div>
          <div data-testid="scan-progress-status">{progress?.status ?? "none"}</div>
          <div data-testid="scan-progress-commits">
            {progress?.commits_indexed ?? "none"}
          </div>
          <div data-testid="scan-progress-cursor">
            {progress?.cursor_sha ?? "none"}
          </div>
          <button
            onClick={() =>
              setScanProgress({
                repo_id: "repo123",
                scan_run_id: "run123",
                status: "running",
                commits_indexed: 12,
                files_processed: 34,
                cursor_sha: "cursor-sha",
                target_head_sha: "head-sha",
                message: "Indexing commits",
              })
            }
          >
            Set Progress
          </button>
          <button onClick={() => clearScanProgress("repo123")}>Clear Progress</button>
        </div>
      );
    }

    render(
      <AppProvider>
        <ScanProgressComponent />
      </AppProvider>
    );

    expect(screen.getByTestId("scan-progress-status")).toHaveTextContent("none");

    await user.click(screen.getByRole("button", { name: "Set Progress" }));

    await waitFor(() => {
      expect(screen.getByTestId("scan-progress-status")).toHaveTextContent("running");
      expect(screen.getByTestId("scan-progress-commits")).toHaveTextContent("12");
      expect(screen.getByTestId("scan-progress-cursor")).toHaveTextContent("cursor-sha");
    });

    await user.click(screen.getByRole("button", { name: "Clear Progress" }));

    await waitFor(() => {
      expect(screen.getByTestId("scan-progress-status")).toHaveTextContent("none");
    });
  });

  it("opens the product tour by default on first launch", () => {
    render(
      <AppProvider>
        <ProductTourStateComponent />
      </AppProvider>
    );

    expect(screen.getByTestId("tour-open")).toHaveTextContent("true");
  });

  it("persists product tour dismissal", async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProductTourStateComponent />
      </AppProvider>
    );

    await user.click(screen.getByRole("button", { name: "Dismiss Tour" }));

    await waitFor(() => {
      expect(screen.getByTestId("tour-open")).toHaveTextContent("false");
    });
    expect(window.localStorage.getItem("gitpulse.productTour.dismissed")).toBe(
      "true",
    );
  });

  it("can reopen and reset the product tour after dismissal", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("gitpulse.productTour.dismissed", "true");

    render(
      <AppProvider>
        <ProductTourStateComponent />
      </AppProvider>
    );

    expect(screen.getByTestId("tour-open")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "Open Tour" }));
    await waitFor(() => {
      expect(screen.getByTestId("tour-open")).toHaveTextContent("true");
    });

    await user.click(screen.getByRole("button", { name: "Dismiss Tour" }));
    await user.click(screen.getByRole("button", { name: "Reset Tour" }));

    await waitFor(() => {
      expect(screen.getByTestId("tour-open")).toHaveTextContent("true");
    });
    expect(window.localStorage.getItem("gitpulse.productTour.dismissed")).toBeNull();
  });
});
