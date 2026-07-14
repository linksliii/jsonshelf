use tauri::{Manager, WebviewWindow};

pub fn toggle_panel(window: &WebviewWindow) {
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
                let _ = w.hide();
            }
        });
    }
}
