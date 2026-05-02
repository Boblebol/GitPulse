import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  useWorkspaces,
  useCreateWorkspace,
  useDeleteWorkspace,
  useAddRepo,
  useAddRepos,
  useDiscoverRepoImportCandidates,
  useRepos,
  useTriggerScan,
  useSetRepoBranch,
  usePauseScan,
  useResumeScan,
  useRepoBranches,
} from "../hooks/useRepos";
import { useUpdateFormula } from "../hooks/useStats";
import { useAppContext } from "../context/AppContext";
import {
  Plus,
  Trash2,
  RefreshCw,
  FlaskConical,
  ChevronDown,
  Pause,
  Play,
  FolderOpen,
} from "lucide-react";
import type { Repo, RepoImportCandidate, ScanProgress } from "../types";
import FieldHint from "../components/FieldHint";
import HelpTooltip from "../components/HelpTooltip";
import PageHelp from "../components/PageHelp";

const DEFAULT_FORMULA =
  "(commits * 10) + (insertions * 0.5) - (deletions * 0.3) + (files_touched * 2) + (streak_bonus * 3)";

const ANALYTICS_QUERY_KEYS = [
  "stats",
  "daily_stats",
  "file_stats",
  "directory_stats",
  "activity_timeline",
  "leaderboard",
  "box_score",
  "insights",
  "weekly_recap",
  "period_leaderboard",
  "period_awards",
  "historical_records",
  "hall_of_fame",
  "file_health_stats",
  "directory_health_stats",
  "developer_focus_stats",
  "review_risk_commits",
  "activity_signal_stats",
  "file_volatility_stats",
  "file_coupling_graph",
];

type AggregateRebuildResult = {
  started_at: string;
  completed_at: string;
  status: string;
};

function clearGitPulseLocalStorage() {
  if (typeof window === "undefined") return;

  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("gitpulse.")) {
      window.localStorage.removeItem(key);
    }
  }
}

function formatScanStatus(status: ScanProgress["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeDialogPaths(result: string | string[] | null): string[] {
  if (result == null) return [];
  return Array.isArray(result) ? result : [result];
}

function RepoBranchPicker({
  repo,
  workspaceId,
}: {
  repo: Repo;
  workspaceId: string;
}) {
  const { data: branches = [] } = useRepoBranches(repo.path);
  const setRepoBranch = useSetRepoBranch();
  const branchOptions = branches.includes(repo.active_branch)
    ? branches
    : [repo.active_branch, ...branches];

  return (
    <div className="relative w-auto max-w-[150px] shrink-0">
      <select
        aria-label={`Active branch for ${repo.name}`}
        value={repo.active_branch}
        disabled={setRepoBranch.isPending}
        onChange={(e) => {
          if (e.target.value !== repo.active_branch) {
            setRepoBranch.mutate({
              repoId: repo.id,
              branch: e.target.value,
              workspaceId,
            });
          }
        }}
        className="w-full appearance-none bg-surface-container-high text-on-surface text-xs rounded px-2 py-1 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 cursor-pointer pr-6 truncate disabled:opacity-40"
      >
        {branchOptions.map((branch) => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-1 top-1/2 transform -translate-y-1/2 text-on-surface-variant pointer-events-none" />
    </div>
  );
}

export default function Settings() {
  const {
    workspaceId,
    setWorkspaceId,
    setRepoId,
    scanningRepoId,
    setScanningRepoId,
    syncStatus,
    setSyncStatus,
    scanProgressByRepo,
    addNotification,
  } = useAppContext();
  const queryClient = useQueryClient();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: repos = [] } = useRepos(workspaceId);
  const createWs = useCreateWorkspace();
  const deleteWs = useDeleteWorkspace();
  const addRepo = useAddRepo();
  const discoverRepoImportCandidates = useDiscoverRepoImportCandidates();
  const addRepos = useAddRepos();
  const triggerScan = useTriggerScan();
  const pauseScan = usePauseScan();
  const resumeScan = useResumeScan();
  const updateFormula = useUpdateFormula();
  const rebuildAggregates = useMutation<AggregateRebuildResult, string>({
    mutationFn: () => invoke<AggregateRebuildResult>("rebuild_aggregates"),
  });
  const deleteAllData = useMutation<void, string>({
    mutationFn: () => invoke("delete_all_data"),
  });

  const [wsName, setWsName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [repoName, setRepoName] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string | undefined>();
  const [importCandidates, setImportCandidates] = useState<RepoImportCandidate[]>(
    [],
  );
  const [selectedImportPaths, setSelectedImportPaths] = useState<Set<string>>(
    new Set(),
  );
  const [formula, setFormula] = useState(DEFAULT_FORMULA);

  // For listing branches when adding a new repo
  const [branches, setBranches] = useState<string[]>([]);
  const importableCandidates = importCandidates.filter(
    (candidate) => !candidate.already_exists,
  );
  const selectedImportCount = importableCandidates.filter((candidate) =>
    selectedImportPaths.has(candidate.path),
  ).length;
  const allImportableSelected =
    importableCandidates.length > 0 &&
    selectedImportCount === importableCandidates.length;

  const handleDeleteAllData = () => {
    const confirmed = window.confirm(
      "This permanently deletes all local GitPulse data: workspaces, repositories, scans, aliases, reports, watchlists, dismissed achievements, and demo state. Your Git repositories are not modified.",
    );
    if (!confirmed) return;

    deleteAllData.mutate(undefined, {
      onSuccess: () => {
        clearGitPulseLocalStorage();
        queryClient.clear();
        setWorkspaceId(null);
        setRepoId(null);
        setScanningRepoId(null);
        setSyncStatus("");
        setRepoPath("");
        setRepoName("");
        setBranches([]);
        setSelectedBranch(undefined);
        setImportCandidates([]);
        setSelectedImportPaths(new Set());
        setFormula(DEFAULT_FORMULA);
        addNotification("All local GitPulse data was deleted.", "success");
      },
      onError: (error) => {
        addNotification(`Could not delete data: ${error}`, "error");
      },
    });
  };

  const handleRebuildAggregates = () => {
    rebuildAggregates.mutate(undefined, {
      onSuccess: () => {
        ANALYTICS_QUERY_KEYS.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
        addNotification("Analytics were rebuilt from local scan data.", "success");
      },
      onError: (error) => {
        addNotification(`Could not rebuild analytics: ${error}`, "error");
      },
    });
  };

  const handleBrowseRepoFolders = async () => {
    try {
      const result = await open({
        directory: true,
        multiple: true,
        title: "Select repository folders",
      });
      const paths = normalizeDialogPaths(result);
      if (paths.length === 0) return;

      discoverRepoImportCandidates.mutate(paths, {
        onSuccess: (candidates) => {
          setImportCandidates(candidates);
          setSelectedImportPaths(
            new Set(
              candidates
                .filter((candidate) => !candidate.already_exists)
                .map((candidate) => candidate.path),
            ),
          );
          if (candidates.length === 0) {
            addNotification("No Git repositories were found in the selected folders.", "error");
          }
        },
        onError: (error) => {
          addNotification(`Could not inspect selected folders: ${error}`, "error");
        },
      });
    } catch (error) {
      addNotification(`Could not open folder picker: ${error}`, "error");
    }
  };

  const toggleImportCandidate = (path: string) => {
    setSelectedImportPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleAllImportCandidates = () => {
    setSelectedImportPaths(() => {
      if (allImportableSelected) return new Set();
      return new Set(importableCandidates.map((candidate) => candidate.path));
    });
  };

  const handleImportSelectedRepos = () => {
    if (!workspaceId) return;

    const selectedRepos = importableCandidates
      .filter((candidate) => selectedImportPaths.has(candidate.path))
      .map((candidate) => ({
        path: candidate.path,
        name: candidate.name,
        branch: candidate.branch,
      }));

    addRepos.mutate(
      { workspaceId, repos: selectedRepos },
      {
        onSuccess: (result) => {
          if (result.failed.length === 0) {
            setImportCandidates([]);
            setSelectedImportPaths(new Set());
          } else {
            const failedPaths = new Set(result.failed.map((failure) => failure.path));
            setImportCandidates((current) =>
              current.filter((candidate) => failedPaths.has(candidate.path)),
            );
            setSelectedImportPaths(failedPaths);
          }

          if (result.added.length > 0) {
            addNotification(`${result.added.length} repositories imported.`, "success");
          }
          if (result.failed.length > 0) {
            addNotification(`${result.failed.length} repositories could not be imported.`, "error");
          }
        },
        onError: (error) => {
          addNotification(`Could not import repositories: ${error}`, "error");
        },
      },
    );
  };

  // Load branches when path changes
  useEffect(() => {
    if (repoPath.trim()) {
      invoke("list_repo_branches", { path: repoPath.trim() })
        .then((result) => {
          const branchList = result as string[];
          setBranches(branchList);
          // Auto-select main or master
          if (!selectedBranch) {
            if (branchList.includes("main")) {
              setSelectedBranch("main");
            } else if (branchList.includes("master")) {
              setSelectedBranch("master");
            } else if (branchList.length > 0) {
              setSelectedBranch(branchList[0]);
            }
          }
        })
        .catch(() => {
          setBranches([]);
          setSelectedBranch(undefined);
        });
    } else {
      setBranches([]);
      setSelectedBranch(undefined);
    }
  }, [repoPath]);

  // Reset sync state when workspace changes
  useEffect(() => {
    setScanningRepoId(null);
    setSyncStatus("");
    setImportCandidates([]);
    setSelectedImportPaths(new Set());
  }, [workspaceId]);

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div>
        <h1
          className="text-3xl font-bold text-on-surface"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}
        >
          Settings
        </h1>
        <p className="text-on-surface-variant text-sm mt-0.5">
          Manage workspaces, repositories, and scoring formula.
        </p>
      </div>

      <PageHelp
        title="Setup flow"
        items={[
          "Create a workspace first; it is the container for one product, team, or repo family.",
          "Add a local Git repository with an absolute path, choose a branch, then run Sync.",
          "Formula and data deletion are advanced controls; they do not modify your Git repositories.",
        ]}
      />

      {/* ── Workspaces ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Workspaces
        </h2>

        {/* Create */}
        <div>
          <div className="flex gap-2">
            <input
              aria-label="Workspace name"
              aria-describedby="workspace-name-hint"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="Workspace name…"
              className="flex-1 bg-surface-container text-on-surface text-sm rounded-lg px-3 py-2 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 placeholder:text-on-surface-variant/50"
            />
            <button
              disabled={!wsName.trim() || createWs.isPending}
              onClick={() => {
                createWs.mutate(wsName.trim());
                setWsName("");
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-on-primary gradient-primary disabled:opacity-40"
            >
              <Plus size={14} /> Create
            </button>
          </div>
          <FieldHint id="workspace-name-hint">
            Use a product, team, or client name. You can add multiple repositories inside it.
          </FieldHint>
        </div>

        {/* List */}
        <div className="space-y-1">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className={[
                "flex items-center justify-between rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
                workspaceId === ws.id
                  ? "bg-surface-container-highest"
                  : "bg-surface-container hover:bg-surface-container-high",
              ].join(" ")}
              onClick={() => {
                setWorkspaceId(ws.id);
                setRepoId(null);
              }}
            >
              <span className="text-sm text-on-surface font-medium">{ws.name}</span>
              <button
                aria-label={`Delete workspace ${ws.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteWs.mutate(ws.id);
                }}
                className="text-on-surface-variant hover:text-error transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Repositories ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Repositories{" "}
          {workspaceId
            ? `— ${workspaces.find((w) => w.id === workspaceId)?.name ?? ""}`
            : "(select a workspace)"}
        </h2>

        {workspaceId && (
          <>
            <div className="space-y-1">
              <div className="flex gap-2">
                <input
                  aria-label="Repository path"
                  aria-describedby="repo-path-hint"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/absolute/path/to/repo"
                  className="flex-1 bg-surface-container text-on-surface text-sm rounded-lg px-3 py-2 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 placeholder:text-on-surface-variant/50 font-mono"
                />
                <input
                  aria-label="Repository display name"
                  aria-describedby="repo-name-hint"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="Display name"
                  className="w-36 bg-surface-container text-on-surface text-sm rounded-lg px-3 py-2 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 placeholder:text-on-surface-variant/50"
                />
                {branches.length > 0 && (
                  <div className="relative w-auto max-w-xs">
                    <select
                      aria-label="Initial branch"
                      aria-describedby="repo-branch-hint"
                      value={selectedBranch || ""}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      className="w-full appearance-none bg-surface-container text-on-surface text-sm rounded-lg px-3 py-2 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 cursor-pointer pr-8 truncate"
                    >
                      {branches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                  </div>
                )}
                <button
                  disabled={
                    !repoPath.trim() ||
                    !repoName.trim() ||
                    addRepo.isPending ||
                    branches.length === 0
                  }
                  onClick={() => {
                    addRepo.mutate({
                      workspaceId,
                      path: repoPath.trim(),
                      name: repoName.trim(),
                      branch: selectedBranch,
                    });
                    setRepoPath("");
                    setRepoName("");
                    setSelectedBranch(undefined);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-on-primary gradient-primary disabled:opacity-40"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              <FieldHint id="repo-path-hint">
                Use an absolute local path, for example <code className="text-primary">/Users/alex/project</code>. GitPulse reads Git history only.
              </FieldHint>
              <FieldHint id="repo-name-hint">
                Display name is the short name shown in selectors and reports.
              </FieldHint>
              {branches.length > 0 && (
                <FieldHint id="repo-branch-hint">
                  Pick the branch whose history should drive the first scan.
                </FieldHint>
              )}
            </div>
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
                  disabled={discoverRepoImportCandidates.isPending || addRepos.isPending}
                  onClick={handleBrowseRepoFolders}
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
                        disabled={importableCandidates.length === 0 || addRepos.isPending}
                        onChange={toggleAllImportCandidates}
                        className="h-4 w-4 accent-primary"
                      />
                      Select all
                    </label>
                    <button
                      type="button"
                      disabled={selectedImportCount === 0 || addRepos.isPending}
                      onClick={handleImportSelectedRepos}
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
                            disabled={candidate.already_exists || addRepos.isPending}
                            onChange={() => toggleImportCandidate(candidate.path)}
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
            {addRepo.isError && (
              <p className="text-xs text-error">{addRepo.error}</p>
            )}
            {addRepos.isError && (
              <p className="text-xs text-error">{addRepos.error}</p>
            )}

            <div className="space-y-1">
              {repos.map((r) => {
                const scanProgress = scanProgressByRepo[r.id];
                const scanStatus = scanProgress?.status;
                const isRepoScanning = scanningRepoId === r.id;
                const hasActiveScanForAnotherRepo = scanningRepoId !== null && scanningRepoId !== r.id;
                const isScanActionPending = triggerScan.isPending || resumeScan.isPending;
                const canPauseScan = scanStatus === "running";
                const canResumeScan = scanStatus === "paused" || scanStatus === "failed";
                const progressMessage = scanProgress?.error || scanProgress?.message;

                return (
                  <div
                    key={r.id}
                    className="flex items-start justify-between gap-3 rounded-lg bg-surface-container px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-on-surface font-medium truncate">{r.name}</span>
                        <RepoBranchPicker repo={r} workspaceId={workspaceId} />
                      </div>
                      <span className="text-xs text-on-surface-variant ml-2 font-mono block mt-1 truncate">{r.path}</span>
                      {(isRepoScanning || scanStatus === "failed") && (scanProgress || syncStatus) && (
                        <div className="mt-1.5 ml-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
                          {scanProgress ? (
                            <>
                              <span className={scanProgress.error ? "font-medium text-error" : "font-medium text-tertiary"}>
                                {formatScanStatus(scanProgress.status)}
                              </span>
                              <span>{scanProgress.commits_indexed} commits</span>
                              <span>{scanProgress.files_processed} files</span>
                              {progressMessage && (
                                <span className={scanProgress.error ? "text-error" : "text-on-surface-variant"}>
                                  {progressMessage}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-tertiary">{syncStatus}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        disabled={isScanActionPending || pauseScan.isPending || scanningRepoId !== null}
                        onClick={() => {
                          console.log("[UI] Sync clicked for repo", r.id);
                          setScanningRepoId(r.id);
                          setSyncStatus("Fetching commits…");
                          triggerScan.mutate(r.id, {
                            onSuccess: (result) => {
                              console.log("[UI] Sync success for repo", r.id, result);
                              addNotification(`${r.name}: ${result.commits_added} commits scanned`, "success");
                              setScanningRepoId(null);
                              setSyncStatus("");
                            },
                            onError: (error) => {
                              console.error("[UI] Sync error for repo", r.id, error);
                              addNotification(`${r.name}: Scan failed`, "error");
                              setScanningRepoId(null);
                              setSyncStatus("");
                            },
                          });
                        }}
                        className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors"
                      >
                        <RefreshCw size={12} className={isRepoScanning && triggerScan.isPending ? "animate-spin" : ""} />
                        Sync
                      </button>
                      {canPauseScan && (
                        <button
                          disabled={pauseScan.isPending || !scanProgress?.scan_run_id || hasActiveScanForAnotherRepo}
                          onClick={() => {
                            if (!scanProgress?.scan_run_id) return;

                            pauseScan.mutate(scanProgress.scan_run_id, {
                              onSuccess: () => {
                                addNotification(`${r.name}: Scan paused`, "success");
                              },
                              onError: (error) => {
                                console.error("[UI] Pause scan error for repo", r.id, error);
                                addNotification(`${r.name}: Pause failed`, "error");
                              },
                            });
                          }}
                          className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors disabled:opacity-40"
                        >
                          <Pause size={12} />
                          Pause
                        </button>
                      )}
                      {canResumeScan && (
                        <button
                          disabled={isScanActionPending || pauseScan.isPending || !scanProgress?.scan_run_id || hasActiveScanForAnotherRepo}
                          onClick={() => {
                            setScanningRepoId(r.id);
                            setSyncStatus("Resuming scan...");
                            resumeScan.mutate(r.id, {
                              onSuccess: () => {
                                addNotification(`${r.name}: Scan resumed`, "success");
                              },
                              onError: (error) => {
                                console.error("[UI] Resume scan error for repo", r.id, error);
                                addNotification(`${r.name}: Resume failed`, "error");
                                setScanningRepoId(null);
                                setSyncStatus("");
                              },
                            });
                          }}
                          className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors disabled:opacity-40"
                        >
                          <Play size={12} />
                          Resume
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── Player Score Formula ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Player Score Formula
        </h2>
        <p className="text-xs text-on-surface-variant">
          Variables{" "}
          <HelpTooltip label="How does the formula work?">
            The formula recalculates player score from stored scan data. It changes analytics only, not your Git history.
          </HelpTooltip>
          : <code className="text-primary">commits</code>,{" "}
          <code className="text-primary">insertions</code>,{" "}
          <code className="text-primary">deletions</code>,{" "}
          <code className="text-primary">files_touched</code>,{" "}
          <code className="text-primary">streak_bonus</code> (1 when streak ≥ 3)
        </p>
        <textarea
          aria-label="Player score formula"
          aria-describedby="formula-hint"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          rows={3}
          className="w-full bg-surface-container text-on-surface text-sm font-mono rounded-lg px-3 py-2 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 resize-none"
        />
        <FieldHint id="formula-hint">
          Keep the listed variable names exactly. Apply Formula recalculates scores from local GitPulse data.
        </FieldHint>
        <div className="flex items-center gap-3">
          <button
            disabled={!formula.trim() || updateFormula.isPending}
            onClick={() => updateFormula.mutate(formula.trim())}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-on-primary gradient-primary disabled:opacity-40"
          >
            <FlaskConical size={14} />
            {updateFormula.isPending ? "Recalculating…" : "Apply Formula"}
          </button>
          <button
            onClick={() => setFormula(DEFAULT_FORMULA)}
            className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Reset to default
          </button>
        </div>
        {updateFormula.isSuccess && (
          <p className="text-xs text-tertiary">Formula applied and scores recalculated.</p>
        )}
        {updateFormula.isError && (
          <p className="text-xs text-error">{updateFormula.error}</p>
        )}
      </section>

      {/* ── Maintenance ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Maintenance
        </h2>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Rebuild GitPulse analytics from local scan data. Source repositories on disk are not touched.
        </p>
        <button
          disabled={rebuildAggregates.isPending || scanningRepoId !== null}
          onClick={handleRebuildAggregates}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-on-primary gradient-primary disabled:opacity-40"
        >
          <RefreshCw size={14} className={rebuildAggregates.isPending ? "animate-spin" : ""} />
          {rebuildAggregates.isPending ? "Rebuilding..." : "Rebuild analytics"}
        </button>
        {scanningRepoId !== null && (
          <p className="text-xs text-error">Stop the current scan before rebuilding analytics.</p>
        )}
        {rebuildAggregates.isSuccess && (
          <p className="text-xs text-tertiary">Analytics rebuilt from local scan data.</p>
        )}
        {rebuildAggregates.isError && (
          <p className="text-xs text-error">{rebuildAggregates.error}</p>
        )}
      </section>

      {/* ── Local Data ─────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg bg-error-container/20 p-4 ring-1 ring-error/20">
        <h2
          className="text-sm uppercase tracking-widest text-error"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Danger Zone
        </h2>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Delete the local SQLite database content and GitPulse browser storage. Source repositories on disk are not touched.
        </p>
        <button
          disabled={deleteAllData.isPending || scanningRepoId !== null}
          onClick={handleDeleteAllData}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-error text-on-primary transition-opacity disabled:opacity-40"
        >
          <Trash2 size={14} />
          {deleteAllData.isPending ? "Deleting..." : "Delete all my data"}
        </button>
        {scanningRepoId !== null && (
          <p className="text-xs text-error">Stop the current scan before deleting all data.</p>
        )}
        {deleteAllData.isError && (
          <p className="text-xs text-error">{deleteAllData.error}</p>
        )}
      </section>
    </div>
  );
}
