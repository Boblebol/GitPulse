use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::commands::repos::RepoError;
use crate::models::repo::Repo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoImportCandidate {
    pub path: String,
    pub name: String,
    pub branch: String,
    pub already_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddRepoInput {
    pub path: String,
    pub name: String,
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoImportFailure {
    pub path: String,
    pub name: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddReposResult {
    pub added: Vec<Repo>,
    pub failed: Vec<RepoImportFailure>,
}

pub(crate) async fn discover_repo_import_candidates(
    pool: &SqlitePool,
    paths: Vec<String>,
) -> Result<Vec<RepoImportCandidate>, RepoError> {
    let mut discovered = BTreeSet::new();

    for raw_path in paths {
        let path = PathBuf::from(raw_path);
        if !path.exists() {
            return Err(RepoError::PathNotFound(path.to_string_lossy().to_string()));
        }

        if is_git_repo(&path) {
            discovered.insert(repo_path_string(&path));
            continue;
        }

        if !path.is_dir() {
            continue;
        }

        for entry in std::fs::read_dir(&path)
            .map_err(|_| RepoError::PathNotFound(path.to_string_lossy().to_string()))?
        {
            let entry =
                entry.map_err(|_| RepoError::PathNotFound(path.to_string_lossy().to_string()))?;
            let child_path = entry.path();
            if child_path.is_dir() && is_git_repo(&child_path) {
                discovered.insert(repo_path_string(&child_path));
            }
        }
    }

    let mut candidates = Vec::new();
    for path in discovered {
        let name = default_repo_name(&path);
        let branch = detect_repo_branch(&path, None)?;
        let already_exists = repo_path_exists(pool, &path).await?;
        candidates.push(RepoImportCandidate {
            path,
            name,
            branch,
            already_exists,
        });
    }

    Ok(candidates)
}

fn is_git_repo(path: &Path) -> bool {
    git2::Repository::open(path).is_ok()
}

pub(crate) fn repo_path_string(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

pub(crate) fn default_repo_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| path.to_string())
}

async fn repo_path_exists(pool: &SqlitePool, path: &str) -> Result<bool, RepoError> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM repos WHERE path = ? LIMIT 1")
        .bind(path)
        .fetch_optional(pool)
        .await?;
    Ok(exists.is_some())
}

pub(crate) fn detect_repo_branch(
    path: &str,
    provided_branch: Option<String>,
) -> Result<String, RepoError> {
    if let Some(branch) = provided_branch {
        return Ok(branch);
    }

    let git_repo =
        git2::Repository::open(path).map_err(|_| RepoError::NotARepo(path.to_string()))?;

    let current_branch = git_repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(|branch| branch.to_string()));

    if let Some(branch) = current_branch {
        return Ok(branch);
    }

    match list_repo_branches(path) {
        Ok(branches) => {
            if branches.contains(&"main".to_string()) {
                Ok("main".to_string())
            } else if branches.contains(&"master".to_string()) {
                Ok("master".to_string())
            } else if !branches.is_empty() {
                Ok(branches[0].clone())
            } else {
                Ok("main".to_string())
            }
        }
        Err(_) => Ok("main".to_string()),
    }
}

pub(crate) fn list_repo_branches(path: &str) -> Result<Vec<String>, RepoError> {
    let repo = git2::Repository::open(path).map_err(|_| RepoError::NotARepo(path.to_string()))?;

    let mut branches = Vec::new();
    let branch_iter = repo
        .branches(None)
        .map_err(|_| RepoError::NotARepo(path.to_string()))?;

    for (branch, _) in branch_iter.flatten() {
        if let Ok(Some(branch_name)) = branch.name() {
            branches.push(branch_name.to_string());
        }
    }

    branches.sort();
    Ok(branches)
}
