use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{Manager, WebviewWindow};

/// 最后一次主动 toggle 的时刻(ms)。用于抑制 toggle 附近的 blur 事件,避免 hide→show 竞态。
static LAST_TOGGLE_MS: AtomicI64 = AtomicI64::new(0);

/// 是否在窗口失焦时自动隐藏。默认 false(不隐藏),可由设置在运行时切换。
static HIDE_ON_BLUR: AtomicBool = AtomicBool::new(false);

/// 运行时切换失焦自动隐藏行为。
pub fn set_hide_on_blur(enabled: bool) {
    HIDE_ON_BLUR.store(enabled, Ordering::Relaxed);
}

/// Tauri 命令:供前端同步失焦自动隐藏设置。
#[tauri::command]
pub fn set_hide_on_blur_cmd(enabled: bool) {
    set_hide_on_blur(enabled);
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn toggle_panel(window: &WebviewWindow) {
    LAST_TOGGLE_MS.store(now_ms(), Ordering::Relaxed);
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn setup_blur_hide(app: &tauri::App) {
    if let Some(win) = app.get_webview_window("main") {
        let w = win.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                // 失焦自动隐藏是可选行为,默认关闭
                if !HIDE_ON_BLUR.load(Ordering::Relaxed) {
                    return;
                }
                // 抑制 toggle 操作附近的 blur,避免 hide→show 竞态
                if now_ms() - LAST_TOGGLE_MS.load(Ordering::Relaxed) < 300 {
                    return;
                }
                let _ = w.hide();
            }
        });
    }
}
