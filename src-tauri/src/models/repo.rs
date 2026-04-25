use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Workspace {
    pub id: String,         // UUID as string (SQLite TEXT)
    pub name: String,
    pub created_at: String, // ISO-8601 UTC
}

impl Workspace {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            created_at: Utc::now().to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Repo {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub path: String,
    pub active_branch: String,
    pub last_indexed_commit_sha: Option<String>,
    pub created_at: String,
}

impl Repo {
    pub fn new(workspace_id: impl Into<String>, name: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            workspace_id: workspace_id.into(),
            name: name.into(),
            path: path.into(),
            active_branch: "main".into(),
            last_indexed_commit_sha: None,
            created_at: Utc::now().to_rfc3339(),
        }
    }
}
