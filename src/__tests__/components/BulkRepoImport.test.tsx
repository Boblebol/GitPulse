import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import BulkRepoImport from "../../components/settings/BulkRepoImport";
import type { RepoImportCandidate } from "../../types";

const candidates: RepoImportCandidate[] = [
  {
    path: "/projects/api",
    name: "api",
    branch: "main",
    already_exists: false,
  },
  {
    path: "/projects/web",
    name: "web",
    branch: "master",
    already_exists: false,
  },
  {
    path: "/projects/old",
    name: "old",
    branch: "main",
    already_exists: true,
  },
];

function renderBulkRepoImport(
  overrides: Partial<ComponentProps<typeof BulkRepoImport>> = {},
) {
  const props: ComponentProps<typeof BulkRepoImport> = {
    importCandidates: candidates,
    selectedImportPaths: new Set(["/projects/api", "/projects/web"]),
    isDiscovering: false,
    isImporting: false,
    onBrowseFolders: jest.fn(),
    onToggleCandidate: jest.fn(),
    onToggleAll: jest.fn(),
    onImportSelected: jest.fn(),
    ...overrides,
  };

  render(<BulkRepoImport {...props} />);

  return props;
}

describe("BulkRepoImport", () => {
  it("renders importable and already imported repository candidates", () => {
    renderBulkRepoImport();

    expect(screen.getByText("Bulk import")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /import api/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /import web/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /import old/i })).toBeDisabled();
    expect(screen.getByText("Already imported")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import 2 repos/i })).toBeEnabled();
  });

  it("delegates browse, select all, candidate toggle, and import actions", async () => {
    const user = userEvent.setup();
    const props = renderBulkRepoImport();

    await user.click(screen.getByRole("button", { name: /browse folders/i }));
    await user.click(screen.getByRole("checkbox", { name: /select all repositories/i }));
    await user.click(screen.getByRole("checkbox", { name: /import api/i }));
    await user.click(screen.getByRole("button", { name: /import 2 repos/i }));

    expect(props.onBrowseFolders).toHaveBeenCalledTimes(1);
    expect(props.onToggleAll).toHaveBeenCalledTimes(1);
    expect(props.onToggleCandidate).toHaveBeenCalledWith("/projects/api");
    expect(props.onImportSelected).toHaveBeenCalledTimes(1);
  });

  it("disables import when no importable repository is selected", () => {
    renderBulkRepoImport({ selectedImportPaths: new Set() });

    expect(screen.getByRole("button", { name: /import 0 repos/i })).toBeDisabled();
  });
});
