import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { DeveloperWithAliases } from "../types";

const DEV_KEY = ["developers"] as const;
const UNREVIEWED_KEY = ["developers", "unreviewed"] as const;
const STATS_KEYS = [
  "stats",
  "activity_timeline",
  "daily_stats",
  "file_stats",
  "directory_stats",
  "leaderboard",
  "box_score",
] as const;

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: DEV_KEY });
  qc.invalidateQueries({ queryKey: UNREVIEWED_KEY });

  for (const key of STATS_KEYS) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export function useDevelopers() {
  return useQuery<DeveloperWithAliases[]>({
    queryKey: DEV_KEY,
    queryFn: () => invoke("list_developers"),
  });
}

export function useUnreviewedDevelopers() {
  return useQuery<DeveloperWithAliases[]>({
    queryKey: UNREVIEWED_KEY,
    queryFn: () => invoke("list_unreviewed_developers"),
  });
}

export function useRenameDeveloper() {
  const qc = useQueryClient();
  return useMutation<void, string, { developerId: string; newName: string }>({
    mutationFn: ({ developerId, newName }) =>
      invoke("rename_developer", { developerId, newName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEV_KEY }),
  });
}

export function useMergeDevelopers() {
  const qc = useQueryClient();
  return useMutation<void, string, { sourceId: string; targetId: string }>({
    mutationFn: ({ sourceId, targetId }) =>
      invoke("merge_developers", { sourceId, targetId }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useReassignAlias() {
  const qc = useQueryClient();
  return useMutation<
    void,
    string,
    { aliasId: string; targetDeveloperId: string }
  >({
    mutationFn: ({ aliasId, targetDeveloperId }) =>
      invoke("reassign_alias", { aliasId, targetDeveloperId }),
    onSuccess: () => invalidateAll(qc),
  });
}
