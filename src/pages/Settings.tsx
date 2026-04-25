import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useWorkspaces,
  useCreateWorkspace,
  useDeleteWorkspace,
  useAddRepo,
  useRepos,
  useTriggerScan,
  useSetRepoBranch,
  usePauseScan,
  useResumeScan,
} from "../hooks/useRepos";
import { useUpdateFormula } from "../hooks/useStats";
import { useAppContext } from "../context/AppContext";
import { Plus, Trash2, RefreshCw, FlaskConical, ChevronDown, Pause, Play } from "lucide-react";
import type { ScanProgress } from "../types";

const DEFAULT_FORMULA =
  "(commits * 10) + (insertions * 0.5) - (deletions * 0.3) + (files_touched * 2) + (streak_bonus * 3)";

function formatScanStatus(status: ScanProgress["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function Settings() {
  const { workspaceId, setWorkspaceId, setRepoId, scanningRepoId, setScanningRepoId, syncStatus, setSyncStatus, scanProgressByRepo, addNotification } = useAppContext();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: repos = [] } = useRepos(workspaceId);
  const createWs = useCreateWorkspace();
  const deleteWs = useDeleteWorkspace();
  const addRepo = useAddRepo();
  const triggerScan = useTriggerScan();
  const pauseScan = usePauseScan();
  const resumeScan = useResumeScan();
  const updateFormula = useUpdateFormula();

  const [wsName, setWsName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [repoName, setRepoName] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string | undefined>();
  const [formula, setFormula] = useState(DEFAULT_FORMULA);

  // For listing branches when adding a new repo
  const [branches, setBranches] = useState<string[]>([]);
  const setRepoBranch = useSetRepoBranch();

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

      {/* ── Workspaces ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2
          className="text-sm uppercase tracking-widest text-on-surface-variant"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Workspaces
        </h2>

        {/* Create */}
        <div className="flex gap-2">
          <input
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="Workspace name…"
            className="flex-1 bg-surface-container text-on-surface text-sm rounded-lg px-3 py-2 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 placeholder:text-on-surface-variant/50"
          />
          <button
            disabled={!wsName.trim() || createWs.isPending}
            onClick={() => { createWs.mutate(wsName.trim()); setWsName(""); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-on-primary gradient-primary disabled:opacity-40"
          >
            <Plus size={14} /> Create
          </button>
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
              onClick={() => { setWorkspaceId(ws.id); setRepoId(null); }}
            >
              <span className="text-sm text-on-surface font-medium">{ws.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteWs.mutate(ws.id); }}
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
          Repositories {workspaceId ? `— ${workspaces.find((w) => w.id === workspaceId)?.name ?? ""}` : "(select a workspace)"}
        </h2>

        {workspaceId && (
          <>
            <div className="flex gap-2">
              <input
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="/absolute/path/to/repo"
                className="flex-1 bg-surface-container text-on-surface text-sm rounded-lg px-3 py-2 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 placeholder:text-on-surface-variant/50 font-mono"
              />
              <input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="Display name"
                className="w-36 bg-surface-container text-on-surface text-sm rounded-lg px-3 py-2 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 placeholder:text-on-surface-variant/50"
              />
              {branches.length > 0 && (
                <div className="relative w-auto max-w-xs">
                  <select
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
                disabled={!repoPath.trim() || !repoName.trim() || addRepo.isPending || branches.length === 0}
                onClick={() => {
                  addRepo.mutate({
                    workspaceId,
                    path: repoPath.trim(),
                    name: repoName.trim(),
                    branch: selectedBranch
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
            {addRepo.isError && (
              <p className="text-xs text-error">{addRepo.error}</p>
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
                        <div className="relative w-auto max-w-[150px] shrink-0">
                          <select
                            value={r.active_branch}
                            onChange={(e) => {
                              if (e.target.value !== r.active_branch) {
                                setRepoBranch.mutate({
                                  repoId: r.id,
                                  branch: e.target.value,
                                  workspaceId,
                                });
                              }
                            }}
                            className="w-full appearance-none bg-surface-container-high text-on-surface text-xs rounded px-2 py-1 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 cursor-pointer pr-6 truncate"
                          >
                            <option value={r.active_branch}>{r.active_branch}</option>
                          </select>
                          <ChevronDown size={12} className="absolute right-1 top-1/2 transform -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                        </div>
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
          Variables: <code className="text-primary">commits</code>,{" "}
          <code className="text-primary">insertions</code>,{" "}
          <code className="text-primary">deletions</code>,{" "}
          <code className="text-primary">files_touched</code>,{" "}
          <code className="text-primary">streak_bonus</code> (1 when streak ≥ 3)
        </p>
        <textarea
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          rows={3}
          className="w-full bg-surface-container text-on-surface text-sm font-mono rounded-lg px-3 py-2 outline-none ring-1 ring-outline-variant/30 focus:ring-primary/40 resize-none"
        />
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
    </div>
  );
}
