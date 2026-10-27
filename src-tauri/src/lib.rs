mod commands;
mod glass;
mod shortcut;
mod tray;
mod window;

use std::sync::OnceLock;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

static GLASS: OnceLock<glass::GlassKind> = OnceLock::new();

#[tauri::command]
fn glass_kind() -> glass::GlassKind {
  *GLASS.get().unwrap_or(&glass::GlassKind::None)
}

/// 启动时把上一轮的 SQLite 数据库(含 WAL/SHM)复制一份,防止误写/崩溃丢掉历史。
fn backup_db(app: &tauri::App) {
  let Ok(dir) = app.path().app_data_dir() else { return };
  let db = dir.join("jsonshelf.db");
  if db.is_file() {
    let _ = std::fs::copy(&db, dir.join("jsonshelf.db.bak"));
    let _ = std::fs::copy(dir.join("jsonshelf.db-wal"), dir.join("jsonshelf.db-wal.bak"));
    let _ = std::fs::copy(dir.join("jsonshelf.db-shm"), dir.join("jsonshelf.db-shm.bak"));
  }
}

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
    Migration {
      version: 3,
      description: "index for metadata-only history queries",
      sql: include_str!("../migrations/0003_index.sql"),
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
    // 记忆窗口位置/大小:插件在窗口 Moved/Resized 时持久化,并在窗口创建时恢复。
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .setup(|app| {
      backup_db(app);
      shortcut::register(app)?;
      window::setup_blur_hide(app);
      window::setup_close_to_hide(app);

      // 原生液态玻璃:必须在主线程(setup 即在主线程)。
      let kind = if let Some(win) = app.get_webview_window("main") {
        glass::apply(&win)
      } else {
        glass::GlassKind::None
      };
      let _ = GLASS.set(kind);
      eprintln!("[jsonshelf] 背景效果: {kind:?}");

      if let Err(e) = tray::setup_app_menu(app) {
        eprintln!("[jsonshelf] 应用菜单设置失败: {e}");
      }
      if let Err(e) = tray::setup(app) {
        eprintln!("[jsonshelf] 状态栏图标设置失败: {e}");
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::export::export_json,
      window::set_hide_on_blur_cmd,
      shortcut::rebind_toggle_shortcut,
      shortcut::shortcut_status,
      glass_kind
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      // 启动完成后校正窗口位置:window-state 可能在 Ready 之后才把窗口搬到
      // 旧显示器/旧尺寸上,所以这里再做一次延迟校正。
      if let tauri::RunEvent::Ready = &event {
        if let Some(win) = app_handle.get_webview_window("main") {
          window::ensure_on_screen(&win);
        }
        let handle = app_handle.clone();
        std::thread::spawn(move || {
          std::thread::sleep(std::time::Duration::from_millis(900));
          let h = handle.clone();
          let _ = handle.run_on_main_thread(move || {
            if let Some(w) = h.get_webview_window("main") {
              window::ensure_on_screen(&w);
            }
          });
        });
      }
      // macOS: 点击 Dock 图标时(应用无可见窗口)重新显示主窗口
      if let tauri::RunEvent::Reopen { .. } = &event {
        if let Some(win) = app_handle.get_webview_window("main") {
          window::show_panel(app_handle, &win);
        }
      }
      // macOS: Dock 右键 → Quit 会派发 ExitRequested;我们拦截并改为隐藏主窗口。
      if let tauri::RunEvent::ExitRequested { api, .. } = &event {
        api.prevent_exit();
        if let Some(w) = app_handle.get_webview_window("main") {
          let _ = w.hide();
        }
      }
    });
}