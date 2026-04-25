use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Commit {
    pub id: String,
    pub repo_id: String,
    pub sha: String,
    pub author_alias_id: String,
    pub message: String,
    pub committed_at: String, // ISO-8601 UTC
    pub insertions: i64,
    pub deletions: i64,
    pub files_changed: i64,
}

impl Commit {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        repo_id: impl Into<String>,
        sha: impl Into<String>,
        author_alias_id: impl Into<String>,
        message: impl Into<String>,
        committed_at: impl Into<String>,
        insertions: i64,
        deletions: i64,
        files_changed: i64,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            repo_id: repo_id.into(),
            sha: sha.into(),
            author_alias_id: author_alias_id.into(),
            message: message.into(),
            committed_at: committed_at.into(),
            insertions,
            deletions,
            files_changed,
        }
    }
}

/// Change type for a file within a commit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChangeType {
    /// Added
    A,
    /// Modified
    M,
    /// Deleted
    D,
    /// Renamed
    R,
    /// Copied
    C,
}

impl ChangeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::A => "A",
            Self::M => "M",
            Self::D => "D",
            Self::R => "R",
            Self::C => "C",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CommitFileChange {
    pub id: String,
    pub commit_id: String,
    pub file_id: String,
    pub change_type: String, // "A" | "M" | "D" | "R" | "C"
    pub insertions: i64,
    pub deletions: i64,
}

impl CommitFileChange {
    pub fn new(
        commit_id: impl Into<String>,
        file_id: impl Into<String>,
        change_type: ChangeType,
        insertions: i64,
        deletions: i64,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            commit_id: commit_id.into(),
            file_id: file_id.into(),
            change_type: change_type.as_str().into(),
            insertions,
            deletions,
        }
    }
}
