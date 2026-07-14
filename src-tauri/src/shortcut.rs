use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::window::toggle_panel;

pub fn register(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Alt+Cmd+J
    let toggle = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyJ);
    let handle = app.handle().clone();
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, shortcut, event| {
                if event.state() == ShortcutState::Pressed && shortcut == &toggle {
                    if let Some(win) = handle.get_webview_window("main") {
                        toggle_panel(&win);
                    }
                }
            })
            .build(),
    )?;
    if let Err(e) = app.global_shortcut().register(toggle) {
        eprintln!("[jsonshelf] 全局快捷键 Alt+Cmd+J 注册失败(可能被其他应用占用): {e}");
    }
    Ok(())
}
