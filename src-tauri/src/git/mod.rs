pub mod incremental;
pub mod rename;
pub mod scanner;

pub use scanner::{
    scan_repo, scan_repo_with_progress, scan_repo_with_progress_and_worktree_root, GitError,
    ScanProgressCallback, ScanResult, SCAN_PROGRESS_EVENT,
};
