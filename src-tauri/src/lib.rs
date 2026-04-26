mod aggregation;
pub mod alias;
mod commands;
mod db;
mod git;
#[cfg(test)]
mod large_repo_benchmark;
pub mod models;
#[cfg(test)]
pub(crate) mod test_utils;

use std::path::PathBuf;
use tauri::Manager;
use tracing::info;

/// Global application state, injected into all Tauri commands.
pub struct AppState {
    /// SQLite connection pool.
    pub db: sqlx::SqlitePool,
    /// Application data directory — `~/.gitpulse/` by default.
    pub config_dir: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            std::fs::create_dir_all(&config_dir)?;

            let db_path = config_dir.join("gitpulse.db");

            // Block on async DB setup inside the sync setup closure.
            let pool = tauri::async_runtime::block_on(db::open(&db_path))
                .expect("failed to open database");

            info!("database opened at {}", db_path.display());

            app.manage(AppState {
                db: pool,
                config_dir,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // repos
            commands::repos::list_workspaces,
            commands::repos::create_workspace,
            commands::repos::delete_workspace,
            commands::repos::list_repos,
            commands::repos::list_repo_branches,
            commands::repos::add_repo,
            commands::repos::set_repo_branch,
            commands::repos::remove_repo,
            commands::repos::trigger_scan,
            commands::repos::pause_scan,
            commands::repos::resume_scan,
            commands::repos::get_scan_status,
            // developers
            commands::developers::list_developers,
            commands::developers::list_unreviewed_developers,
            commands::developers::rename_developer,
            commands::developers::merge_developers,
            commands::developers::reassign_alias,
            // stats
            commands::stats::get_developer_global_stats,
            commands::stats::get_daily_stats,
            commands::stats::get_file_stats,
            commands::stats::get_directory_stats,
            commands::stats::get_activity_timeline,
            // history
            commands::history::get_period_leaderboard,
            commands::history::get_period_awards,
            commands::history::get_historical_records,
            commands::history::get_hall_of_fame,
            // code health
            commands::health::get_file_health_stats,
            commands::health::get_directory_health_stats,
            commands::health::get_developer_focus_stats,
            commands::health::get_review_risk_commits,
            commands::health::get_activity_signal_stats,
            commands::health::get_file_volatility_stats,
            commands::health::get_file_coupling_graph,
            // boxscore
            commands::boxscore::get_box_score,
            commands::boxscore::get_leaderboard,
            commands::boxscore::update_formula,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
