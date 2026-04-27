import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { AppProvider, useAppContext } from "../../context/AppContext";
import AliasManager from "../../pages/AliasManager";
import type { DeveloperWithAliases } from "../../types";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const developers: DeveloperWithAliases[] = [
  {
    id: "dev1",
    name: "Alice",
    created_at: "2026-04-01T00:00:00Z",
    is_auto_created: true,
    aliases: [
      {
        id: "alias1",
        developer_id: "dev1",
        git_name: "Alice",
        git_email: "alice@example.com",
        created_at: "2026-04-01T00:00:00Z",
      },
    ],
  },
  {
    id: "dev2",
    name: "Bob",
    created_at: "2026-04-01T00:00:00Z",
    is_auto_created: false,
    aliases: [
      {
        id: "alias2",
        developer_id: "dev2",
        git_name: "Bob",
        git_email: "bob@example.com",
        created_at: "2026-04-01T00:00:00Z",
      },
    ],
  },
];

function ScanningStateSeed({
  repoId,
  children,
}: {
  repoId: string | null;
  children: ReactNode;
}) {
  const { setScanningRepoId } = useAppContext();

  useEffect(() => {
    setScanningRepoId(repoId);
  }, [repoId, setScanningRepoId]);

  return <>{children}</>;
}

function renderWithClient(
  children: ReactNode,
  options: { scanningRepoId?: string | null } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <ScanningStateSeed repoId={options.scanningRepoId ?? null}>
          {children}
        </ScanningStateSeed>
      </AppProvider>
    </QueryClientProvider>
  );
}

describe("AliasManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (invoke as jest.Mock).mockImplementation((command: string) => {
      if (command === "list_unreviewed_developers") {
        return Promise.resolve([developers[0]]);
      }
      if (command === "list_developers") {
        return Promise.resolve(developers);
      }
      if (command === "reassign_alias") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });
  });

  it("reassigns a single alias to another developer", async () => {
    const user = userEvent.setup();
    renderWithClient(<AliasManager />);

    await user.click(await screen.findByRole("button", { name: /Alice/i }));

    await user.selectOptions(
      screen.getByLabelText("Move Alice <alice@example.com> to"),
      "dev2"
    );
    await user.click(
      screen.getByRole("button", {
        name: "Move alias Alice <alice@example.com>",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("reassign_alias", {
        aliasId: "alias1",
        targetDeveloperId: "dev2",
      });
    });
  });

  it("disables merge and alias moves while a scan is running", async () => {
    const user = userEvent.setup();
    renderWithClient(<AliasManager />, { scanningRepoId: "repo1" });

    await user.click(await screen.findByRole("button", { name: /Alice/i }));

    expect(
      screen.getByText(/alias changes are locked while a scan is running/i)
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Move Alice <alice@example.com> to")).toBeDisabled();
    expect(screen.getByLabelText("Merge Alice into")).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Move alias Alice <alice@example.com>",
      })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Merge$/i })).toBeDisabled();
  });
});
