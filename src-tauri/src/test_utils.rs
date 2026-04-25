/// Shared git + DB helpers for integration and E2E tests.
/// Only compiled in test mode.
use git2::{Repository, Signature, Time};
use sqlx::SqlitePool;
use std::path::Path;
use uuid::Uuid;

/// Initialise an empty git repository at `dir`.
pub fn init_repo(dir: &Path) -> Repository {
    Repository::init(dir).expect("init_repo")
}

/// Write files and create a signed commit at a fixed Unix timestamp.
pub fn commit_at(
    repo: &Repository,
    msg: &str,
    author: &str,
    email: &str,
    files: &[(&str, &str)],
    ts: i64,
) {
    let workdir = repo.workdir().unwrap().to_owned();
    for (name, content) in files {
        let p = workdir.join(name);
        if let Some(par) = p.parent() {
            std::fs::create_dir_all(par).unwrap();
        }
        std::fs::write(&p, content).unwrap();
    }
    let mut idx = repo.index().unwrap();
    for (name, _) in files {
        idx.add_path(Path::new(name)).unwrap();
    }
    idx.write().unwrap();
    let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
    let sig = Signature::new(author, email, &Time::new(ts, 0)).unwrap();
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent.as_ref().into_iter().collect();
    repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents)
        .unwrap();
}

/// Insert a workspace + repo record; return `(workspace_id, repo_id)`.
pub async fn seed_workspace_and_repo(pool: &SqlitePool, path: &Path) -> (String, String) {
    let now = chrono::Utc::now().to_rfc3339();
    let ws_id = Uuid::new_v4().to_string();
    let repo_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES (?,?,?)")
        .bind(&ws_id)
        .bind("workspace")
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO repos (id, workspace_id, name, path, active_branch, created_at)
         VALUES (?,?,?,?,?,?)",
    )
    .bind(&repo_id)
    .bind(&ws_id)
    .bind("repo")
    .bind(path.to_str().unwrap())
    .bind("main")
    .bind(&now)
    .execute(pool)
    .await
    .unwrap();
    (ws_id, repo_id)
}
