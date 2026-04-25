use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::git::scanner::ScanProgressPayload;
use crate::models::scan::ScanRunStatus;
use crate::test_utils::{commit_at, init_repo, seed_workspace_and_repo};

const DEFAULT_COMMITS: usize = 2_000;
const DEFAULT_FILES_PER_COMMIT: usize = 2;
const BASE_TS: i64 = 1_704_067_200;

#[derive(Debug, Default)]
struct BatchStats {
    previous_commits_indexed: i64,
    peak_batch_size: i64,
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "run manually with: cargo test large_repo_benchmark -- --ignored --nocapture"]
async fn large_repo_benchmark_reports_scan_and_aggregate_timings() {
    let commits = env_usize("GITPULSE_BENCH_COMMITS", DEFAULT_COMMITS);
    let files_per_commit = env_usize("GITPULSE_BENCH_FILES_PER_COMMIT", DEFAULT_FILES_PER_COMMIT);

    let generation_started = Instant::now();
    let tmp = tempfile::TempDir::new().unwrap();
    let repo = init_repo(tmp.path());
    generate_repo(&repo, commits, files_per_commit);
    let generation_duration = generation_started.elapsed();

    let branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_string))
        .unwrap_or_else(|| "master".to_string());
    let pool = crate::db::test_pool().await;
    let (_, repo_id) = seed_workspace_and_repo(&pool, tmp.path()).await;

    let batch_stats = Arc::new(Mutex::new(BatchStats::default()));
    let stats_for_callback = Arc::clone(&batch_stats);
    let progress_callback: crate::git::ScanProgressCallback =
        Arc::new(move |payload: ScanProgressPayload| {
            if payload.status != ScanRunStatus::Running {
                return;
            }

            let mut stats = stats_for_callback.lock().unwrap();
            let batch_size = payload.commits_indexed - stats.previous_commits_indexed;
            if batch_size > 0 {
                stats.peak_batch_size = stats.peak_batch_size.max(batch_size);
                stats.previous_commits_indexed = payload.commits_indexed;
            }
        });

    let scan_started = Instant::now();
    let scan_result = crate::git::scan_repo_with_progress(
        &pool,
        &repo_id,
        tmp.path(),
        &branch,
        progress_callback,
    )
    .await
    .unwrap();
    let scan_duration = scan_started.elapsed();

    let aggregate_started = Instant::now();
    crate::aggregation::recalculate_all(&pool).await.unwrap();
    let aggregate_duration = aggregate_started.elapsed();

    let batch_stats = batch_stats.lock().unwrap();
    println!(
        "large_repo_benchmark commits={} generated_files={} files_per_commit={} files_processed={} generation_ms={} scan_ms={} aggregate_ms={} peak_batch_size={}",
        commits,
        commits * files_per_commit,
        files_per_commit,
        scan_result.files_processed,
        generation_duration.as_millis(),
        scan_duration.as_millis(),
        aggregate_duration.as_millis(),
        batch_stats.peak_batch_size
    );

    assert_eq!(scan_result.commits_added, commits);
    assert_eq!(scan_result.files_processed, commits * files_per_commit);
    assert!(batch_stats.peak_batch_size > 0);
}

fn generate_repo(repo: &git2::Repository, commits: usize, files_per_commit: usize) {
    for commit_idx in 0..commits {
        let files = (0..files_per_commit)
            .map(|file_idx| {
                let path = format!(
                    "src/pkg_{:03}/file_{:04}_{:02}.rs",
                    commit_idx % 100,
                    commit_idx,
                    file_idx
                );
                let content =
                    format!("pub const VALUE_{commit_idx}_{file_idx}: usize = {commit_idx};\n");
                (path, content)
            })
            .collect::<Vec<_>>();
        let file_refs = files
            .iter()
            .map(|(path, content)| (path.as_str(), content.as_str()))
            .collect::<Vec<_>>();
        commit_at(
            repo,
            &format!("bench commit {commit_idx}"),
            "Benchmark",
            "bench@example.com",
            &file_refs,
            BASE_TS + commit_idx as i64,
        );
    }
}

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}
