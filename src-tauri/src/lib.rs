mod commands;
mod shortcut;
mod window;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let migrations = vec![Migration {
    version: 1,
    description: "create history table",
    sql: include_str!("../migrations/0001_init.sql"),
    kind: MigrationKind::Up,
  }];

  tauri::Builder::default()
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:jsonshelf.db", migrations)
        .build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      shortcut::register(app)?;
      window::setup_blur_hide(app);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![commands::export::export_json])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
