use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Developer {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

impl Developer {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            created_at: Utc::now().to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Alias {
    pub id: String,
    pub developer_id: String,
    pub git_name: String,
    pub git_email: String,
    pub created_at: String,
}

impl Alias {
    pub fn new(developer_id: impl Into<String>, git_name: impl Into<String>, git_email: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            developer_id: developer_id.into(),
            git_name: git_name.into(),
            git_email: git_email.into(),
            created_at: Utc::now().to_rfc3339(),
        }
    }
}
