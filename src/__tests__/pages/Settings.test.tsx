import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../../context/AppContext";
import Settings from "../../pages/Settings";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

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
      return Promise.resolve([]);
    });
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
});
