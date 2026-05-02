import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../../context/AppContext";
import Settings from "../../pages/Settings";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

jest.mock("@tauri-apps/plugin-dialog", () => ({
  open: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

describe("Settings", () => {
  let queryClient: QueryClient;
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    window.localStorage.clear();
    window.localStorage.setItem("gitpulse.watchlist.items", "[]");
    window.localStorage.setItem("other.product.key", "kept");
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    (invoke as jest.Mock).mockImplementation((command: string) => {
      if (command === "list_workspaces") return Promise.resolve([]);
      if (command === "delete_all_data") return Promise.resolve(undefined);
      if (command === "rebuild_aggregates") {
        return Promise.resolve({
          started_at: "2026-04-30T10:00:00Z",
          completed_at: "2026-04-30T10:00:01Z",
          status: "completed",
        });
      }
      return Promise.resolve([]);
    });
    (open as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  function renderSettings() {
    return render(
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <Settings />
        </AppProvider>
      </QueryClientProvider>,
    );
  }

  it("deletes all local GitPulse data after confirmation", async () => {
    renderSettings();

    await userEvent.click(
      screen.getByRole("button", { name: /delete all my data/i }),
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("delete_all_data");
    });
    expect(window.localStorage.getItem("gitpulse.watchlist.items")).toBeNull();
    expect(window.localStorage.getItem("other.product.key")).toBe("kept");
  });

  it("explains the setup flow and repository path field", async () => {
    renderSettings();

    expect(screen.getByText("Setup flow")).toBeInTheDocument();
    expect(
      screen.getByText(/create a workspace first/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace name")).toHaveAccessibleDescription(
      /add multiple repositories/i,
    );
  });

  it("starts an aggregate rebuild from the maintenance action", async () => {
    renderSettings();

    await userEvent.click(
      screen.getByRole("button", { name: /rebuild analytics/i }),
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("rebuild_aggregates");
    });
  });

  it("imports selected repository folders into the current workspace", async () => {
    (invoke as jest.Mock).mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "list_workspaces") {
        return Promise.resolve([{ id: "ws1", name: "Product", created_at: "2026-05-02T10:00:00Z" }]);
      }
      if (command === "list_repos") return Promise.resolve([]);
      if (command === "discover_repo_import_candidates") {
        expect(args).toEqual({ paths: ["/projects/api", "/projects/web"] });
        return Promise.resolve([
          { path: "/projects/api", name: "api", branch: "main", already_exists: false },
          { path: "/projects/web", name: "web", branch: "master", already_exists: false },
        ]);
      }
      if (command === "add_repos") {
        return Promise.resolve({
          added: [
            {
              id: "repo-api",
              workspace_id: "ws1",
              name: "api",
              path: "/projects/api",
              active_branch: "main",
              last_indexed_commit_sha: null,
              created_at: "2026-05-02T10:00:00Z",
            },
            {
              id: "repo-web",
              workspace_id: "ws1",
              name: "web",
              path: "/projects/web",
              active_branch: "master",
              last_indexed_commit_sha: null,
              created_at: "2026-05-02T10:00:01Z",
            },
          ],
          failed: [],
        });
      }
      return Promise.resolve([]);
    });
    (open as jest.Mock).mockResolvedValue(["/projects/api", "/projects/web"]);

    renderSettings();

    await userEvent.click(await screen.findByText("Product"));
    await userEvent.click(screen.getByRole("button", { name: /browse folders/i }));
    await screen.findByText("/projects/api");
    expect(screen.getByText("/projects/web")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /import 2 repos/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("add_repos", {
        workspaceId: "ws1",
        repos: [
          { path: "/projects/api", name: "api", branch: "main" },
          { path: "/projects/web", name: "web", branch: "master" },
        ],
      });
    });
  });

  it("lets users select all discovered repository folders", async () => {
    (invoke as jest.Mock).mockImplementation((command: string) => {
      if (command === "list_workspaces") {
        return Promise.resolve([{ id: "ws1", name: "Product", created_at: "2026-05-02T10:00:00Z" }]);
      }
      if (command === "list_repos") return Promise.resolve([]);
      if (command === "discover_repo_import_candidates") {
        return Promise.resolve([
          { path: "/projects/api", name: "api", branch: "main", already_exists: false },
          { path: "/projects/web", name: "web", branch: "main", already_exists: false },
        ]);
      }
      if (command === "add_repos") return Promise.resolve({ added: [], failed: [] });
      return Promise.resolve([]);
    });
    (open as jest.Mock).mockResolvedValue(["/projects/api", "/projects/web"]);

    renderSettings();

    await userEvent.click(await screen.findByText("Product"));
    await userEvent.click(screen.getByRole("button", { name: /browse folders/i }));
    await screen.findByText("/projects/api");

    await userEvent.click(screen.getByRole("checkbox", { name: /select all repositories/i }));

    expect(screen.getByRole("checkbox", { name: /import api/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /import web/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /import 0 repos/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /select all repositories/i }));

    expect(screen.getByRole("checkbox", { name: /import api/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /import web/i })).toBeChecked();
  });
});
