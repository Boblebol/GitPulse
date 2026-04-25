use sqlx::SqlitePool;

/// Run all embedded SQL migrations in order.
/// Uses sqlx's built-in migrator pointed at the `migrations/` directory
/// embedded at compile time.
pub async fn run(pool: &SqlitePool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("src/db/migrations").run(pool).await
}
