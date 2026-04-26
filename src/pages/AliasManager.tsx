import { useState } from "react";
import {
  useUnreviewedDevelopers,
  useDevelopers,
  useMergeDevelopers,
  useReassignAlias,
} from "../hooks/useDevelopers";
import { GitMerge, AlertCircle, ChevronDown, ChevronUp, MoveRight } from "lucide-react";
import type { Alias } from "../types";

export default function AliasManager() {
  const { data: unreviewed = [] } = useUnreviewedDevelopers();
  const { data: allDevs = [] } = useDevelopers();
  const merge = useMergeDevelopers();
  const reassign = useReassignAlias();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const [aliasTarget, setAliasTarget] = useState<Record<string, string>>({});

  function aliasLabel(alias: Alias) {
    return `${alias.git_name} <${alias.git_email}>`;
  }

  function doMerge(sourceId: string) {
    const targetId = mergeTarget[sourceId];
    if (!targetId) return;
    merge.mutate({ sourceId, targetId });
  }

  function doReassign(aliasId: string) {
    const targetDeveloperId = aliasTarget[aliasId];
    if (!targetDeveloperId) return;
    reassign.mutate(
      { aliasId, targetDeveloperId },
      {
        onSuccess: () =>
          setAliasTarget((prev) => ({ ...prev, [aliasId]: "" })),
      }
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-bold text-on-surface"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}
        >
          Alias Manager
        </h1>
        <p className="text-on-surface-variant text-sm mt-0.5">
          Merge git identities that belong to the same developer.
        </p>
      </div>

      {/* Unreviewed banner */}
      {unreviewed.length > 0 && (
        <div className="flex items-center gap-3 bg-surface-container-high rounded-lg px-4 py-3">
          <AlertCircle size={16} className="text-primary shrink-0" />
          <p className="text-sm text-on-surface">
            <span className="font-semibold text-primary">{unreviewed.length}</span>{" "}
            auto-created developer{unreviewed.length > 1 ? "s" : ""} waiting for review.
          </p>
        </div>
      )}

      {/* Developer list */}
      <div className="space-y-2">
        {allDevs.map((dev) => {
          const isOpen = expanded === dev.id;
          return (
            <div
              key={dev.id}
              className="rounded-lg bg-surface-container-high overflow-hidden"
            >
              {/* Row header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container-highest transition-colors"
                onClick={() => setExpanded(isOpen ? null : dev.id)}
              >
                <div className="flex items-center gap-3">
                  {dev.is_auto_created && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary-container/20 text-primary border border-primary/20">
                      unreviewed
                    </span>
                  )}
                  <span
                    className="font-semibold text-on-surface"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    {dev.name}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {dev.aliases.length} alias{dev.aliases.length !== 1 ? "es" : ""}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp size={15} className="text-on-surface-variant" />
                ) : (
                  <ChevronDown size={15} className="text-on-surface-variant" />
                )}
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-outline-variant/15 px-4 py-3 space-y-3">
                  {/* Alias list */}
                  <div className="space-y-1">
                    {dev.aliases.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-col gap-2 rounded-md bg-surface-container/60 px-3 py-2 text-sm sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-on-surface font-mono">{a.git_name}</span>
                          <span className="text-on-surface-variant mx-2">·</span>
                          <span className="text-on-surface-variant break-all">{a.git_email}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Move ${aliasLabel(a)} to`}
                            value={aliasTarget[a.id] ?? ""}
                            onChange={(e) =>
                              setAliasTarget((prev) => ({
                                ...prev,
                                [a.id]: e.target.value,
                              }))
                            }
                            className="min-w-0 max-w-[180px] bg-surface-container-high text-on-surface text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/40"
                          >
                            <option value="">Move to...</option>
                            {allDevs
                              .filter((d) => d.id !== dev.id)
                              .map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                          </select>
                          <button
                            aria-label={`Move alias ${aliasLabel(a)}`}
                            disabled={!aliasTarget[a.id] || reassign.isPending}
                            onClick={() => doReassign(a.id)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-primary gradient-primary disabled:opacity-40 transition-opacity"
                          >
                            <MoveRight size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Merge action */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-on-surface-variant">Merge into →</span>
                    <select
                      value={mergeTarget[dev.id] ?? ""}
                      onChange={(e) =>
                        setMergeTarget((prev) => ({ ...prev, [dev.id]: e.target.value }))
                      }
                      className="flex-1 bg-surface-container text-on-surface text-sm rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      <option value="">— choose target —</option>
                      {allDevs
                        .filter((d) => d.id !== dev.id)
                        .map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    <button
                      disabled={!mergeTarget[dev.id] || merge.isPending}
                      onClick={() => doMerge(dev.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-on-primary gradient-primary disabled:opacity-40 transition-opacity"
                    >
                      <GitMerge size={13} />
                      Merge
                    </button>
                  </div>

                  {merge.isError && (
                    <p className="text-xs text-error">{merge.error}</p>
                  )}
                  {reassign.isError && (
                    <p className="text-xs text-error">{reassign.error}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allDevs.length === 0 && (
        <div className="rounded-lg bg-surface-container-low p-8 text-center text-on-surface-variant">
          No developers found. Sync a repository first.
        </div>
      )}
    </div>
  );
}
