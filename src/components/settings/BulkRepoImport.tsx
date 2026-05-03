import { FolderOpen, Plus } from "lucide-react";
import type { RepoImportCandidate } from "../../types";

type BulkRepoImportProps = {
  importCandidates: RepoImportCandidate[];
  selectedImportPaths: Set<string>;
  isDiscovering: boolean;
  isImporting: boolean;
  onBrowseFolders: () => void;
  onToggleCandidate: (path: string) => void;
  onToggleAll: () => void;
  onImportSelected: () => void;
};

export default function BulkRepoImport({
  importCandidates,
  selectedImportPaths,
  isDiscovering,
  isImporting,
  onBrowseFolders,
  onToggleCandidate,
  onToggleAll,
  onImportSelected,
}: BulkRepoImportProps) {
  const importableCandidates = importCandidates.filter(
    (candidate) => !candidate.already_exists,
  );
  const selectedImportCount = importableCandidates.filter((candidate) =>
    selectedImportPaths.has(candidate.path),
  ).length;
  const allImportableSelected =
    importableCandidates.length > 0 &&
    selectedImportCount === importableCandidates.length;

  return (
    <div className="space-y-2 rounded-lg bg-surface-container px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-on-surface">Bulk import</p>
          <p className="text-xs text-on-surface-variant">
            Select several repository folders or one parent folder containing repositories.
          </p>
        </div>
        <button
          type="button"
          disabled={isDiscovering || isImporting}
          onClick={onBrowseFolders}
          className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-40"
        >
          <FolderOpen size={14} /> Browse folders
        </button>
      </div>

      {importCandidates.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/20 pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-on-surface">
              <input
                type="checkbox"
                aria-label="Select all repositories"
                checked={allImportableSelected}
                disabled={importableCandidates.length === 0 || isImporting}
                onChange={onToggleAll}
                className="h-4 w-4 accent-primary"
              />
              Select all
            </label>
            <button
              type="button"
              disabled={selectedImportCount === 0 || isImporting}
              onClick={onImportSelected}
              className="flex items-center gap-1.5 rounded-full text-sm font-semibold text-on-primary gradient-primary px-3 py-2 disabled:opacity-40"
            >
              <Plus size={14} /> Import {selectedImportCount} repos
            </button>
          </div>
          <div className="max-h-56 space-y-1 overflow-auto pr-1">
            {importCandidates.map((candidate) => {
              const isSelected = selectedImportPaths.has(candidate.path);
              return (
                <label
                  key={candidate.path}
                  className={[
                    "flex items-start gap-2 rounded-md px-2 py-2 text-sm",
                    candidate.already_exists
                      ? "bg-surface-container-high/40 text-on-surface-variant"
                      : "bg-surface-container-high text-on-surface",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    aria-label={`Import ${candidate.name}`}
                    checked={isSelected}
                    disabled={candidate.already_exists || isImporting}
                    onChange={() => onToggleCandidate(candidate.path)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{candidate.name}</span>
                      <span className="rounded bg-surface-container-highest px-1.5 py-0.5 text-[11px] text-on-surface-variant">
                        {candidate.branch}
                      </span>
                      {candidate.already_exists && (
                        <span className="text-[11px] text-on-surface-variant">
                          Already imported
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-on-surface-variant">
                      {candidate.path}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
