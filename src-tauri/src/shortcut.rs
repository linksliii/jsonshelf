use std::str::FromStr;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::window::toggle_panel;

/// 当前生效的呼出面板快捷键。运行时可被 rebind_toggle_shortcut 替换。
static CURRENT_TOGGLE: Mutex<Option<Shortcut>> = Mutex::new(None);

/// 注册状态,供设置面板展示"是否真的生效"(被其它应用占用时用户能立刻看到)。
#[derive(Clone, serde::Serialize)]
pub struct ShortcutStatus {
  pub accelerator: String,
  pub registered: bool,
}

static STATUS: Mutex<Option<ShortcutStatus>> = Mutex::new(None);

fn set_status(accelerator: &str, registered: bool) {
  if let Ok(mut s) = STATUS.lock() {
    *s = Some(ShortcutStatus {
      accelerator: accelerator.to_string(),
      registered,
    });
  }
}

/// 供前端查询全局快捷键注册状态。
#[tauri::command]
pub fn shortcut_status() -> Option<ShortcutStatus> {
  STATUS.lock().ok().and_then(|s| s.clone())
}

pub fn register(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  // 默认呼出键 Alt+Cmd+J
  let toggle = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyJ);
  let handle = app.handle().clone();

  // plugin + handler 只注册一次;handler 比对 CURRENT_TOGGLE 的当前值。
  // 窗口操作统一切回主线程执行,避免 AppKit 调用从后台线程发起。
  app.handle().plugin(
    tauri_plugin_global_shortcut::Builder::new()
      .with_handler(move |_app, shortcut, event| {
        if event.state() != ShortcutState::Pressed {
          return;
        }
        let is_toggle = CURRENT_TOGGLE
          .lock()
          .ok()
          .and_then(|g| *g)
          .map(|cur| &cur == shortcut)
          .unwrap_or(false);
        if !is_toggle {
          return;
        }
        let handle = handle.clone();
        let _ = handle.clone().run_on_main_thread(move || {
          if let Some(win) = handle.get_webview_window("main") {
            toggle_panel(&handle, &win);
          }
        });
      })
      .build(),
  )?;

  // 注册初始呼出键并记录当前值。
  let accel = "Alt+Cmd+J";
  match app.global_shortcut().register(toggle) {
    Ok(()) => {
      if let Ok(mut g) = CURRENT_TOGGLE.lock() {
        *g = Some(toggle);
      }
      set_status(accel, true);
    }
    Err(e) => {
      eprintln!("[jsonshelf] 全局快捷键 {accel} 注册失败(可能被其他应用占用): {e}");
      set_status(accel, false);
      let _ = app.emit("shortcut:failed", accel);
    }
  }
  Ok(())
}

/// 运行时更换呼出面板的全局快捷键。
/// - 解析 accelerator(如 "Alt+Cmd+J");解析失败返回 Err,旧键保持不变。
/// - 注册新键成功后再注销旧键并更新 CURRENT_TOGGLE;
///   若新键注册失败,旧键继续有效。
#[tauri::command]
pub fn rebind_toggle_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
  let new_shortcut =
    Shortcut::from_str(&accelerator).map_err(|e| format!("快捷键解析失败: {e}"))?;

  let gs = app.global_shortcut();

  // 与当前键相同则无需操作。
  let old = CURRENT_TOGGLE.lock().ok().and_then(|g| *g);
  if old == Some(new_shortcut) {
    set_status(&accelerator, true);
    return Ok(());
  }

  // 先注册新键;失败则保持旧键有效。
  gs.register(new_shortcut)
    .map_err(|e| format!("快捷键注册失败(可能被占用): {e}"))?;

  // 新键就绪后再注销旧键(注销失败不致命,不回滚新键)。
  if let Some(old_shortcut) = old {
    let _ = gs.unregister(old_shortcut);
  }

  if let Ok(mut g) = CURRENT_TOGGLE.lock() {
    *g = Some(new_shortcut);
  }
  set_status(&accelerator, true);
  Ok(())
}
