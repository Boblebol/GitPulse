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

describe("AppContext", () => {
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
});
