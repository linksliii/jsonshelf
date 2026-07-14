mod commands;
mod shortcut;
mod window;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let migrations = vec![
    Migration {
      version: 1,
      description: "create history table",
      sql: include_str!("../migrations/0001_init.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "create settings table",
      sql: include_str!("../migrations/0002_settings.sql"),
      kind: MigrationKind::Up,
    },
  ];

  tauri::Builder::default()
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:jsonshelf.db", migrations)
        .build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    // 记忆窗口位置/大小:插件在窗口 Moved/Resized 时持久化,并在窗口创建时恢复。
    // 配合移除 tauri.conf.json 的 center 让恢复的坐标不被居中覆盖。
    .plugin(tauri_plugin_window_state::Builder::default().build())
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
      window::setup_close_to_hide(app);

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::export::export_json,
      window::set_hide_on_blur_cmd,
      shortcut::rebind_toggle_shortcut
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      // macOS: 点击 Dock 图标时(应用无可见窗口)重新显示主窗口
      if let tauri::RunEvent::Reopen { .. } = event {
        if let Some(win) = app_handle.get_webview_window("main") {
          // 不再 center():保留窗口上次所在位置(由 window-state 插件恢复/维护),
          // 仅显示并聚焦。
          let _ = win.show();
          let _ = win.set_focus();
        }
      }
    });
}
