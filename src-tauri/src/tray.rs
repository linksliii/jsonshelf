use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

/// 菜单栏图标:使用 assets 里生成的"竖眼小人"模板图。
/// 模板图会自动跟随浅色/深色菜单栏反色,所以只存单色 alpha。
/// 用裸 RGBA 而不是 PNG,避免运行时解码失败导致托盘图标直接不显示。
const TRAY_RGBA: &[u8] = include_bytes!("../../assets/tray-template.rgba");
const TRAY_SIZE: u32 = 36;

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "tray_show", "呼出面板", true, None::<&str>)?;
    let new_i = MenuItem::with_id(app, "tray_new", "新建", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "tray_settings", "设置", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "tray_quit", "退出 JSONShelf", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &new_i, &settings_i, &sep, &quit_i])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("JSONShelf")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray_show" => {
                if let Some(w) = app.get_webview_window("main") {
                    // 菜单项是"呼出",应当总是显示并聚焦,而不是切换。
                    crate::window::show_panel(app, &w);
                }
            }
            "tray_new" => {
                if let Some(w) = app.get_webview_window("main") {
                    crate::window::show_panel(app, &w);
                    let _ = w.emit("tray:new", ());
                }
            }
            "tray_settings" => {
                if let Some(w) = app.get_webview_window("main") {
                    crate::window::show_panel(app, &w);
                    let _ = w.emit("tray:settings", ());
                }
            }
            "tray_quit" => {
                std::process::exit(0);
            }
            _ => {}
        });

    let icon = tauri::image::Image::new_owned(TRAY_RGBA.to_vec(), TRAY_SIZE, TRAY_SIZE);
    builder = builder.icon(icon).icon_as_template(true);
    builder.build(app)?;
    Ok(())
}

pub fn setup_app_menu(app: &tauri::App) -> tauri::Result<()> {
    let quit_item = MenuItem::with_id(app, "app_quit", "退出 JSONShelf", true, Some("Cmd+Q"))?;

    let about = PredefinedMenuItem::about(app, Some("JSONShelf"), None)?;
    let services = PredefinedMenuItem::services(app, None)?;
    let hide_i = PredefinedMenuItem::hide(app, None)?;
    let hide_others_i = PredefinedMenuItem::hide_others(app, None)?;
    let show_all_i = PredefinedMenuItem::show_all(app, None)?;
    let app_sep1 = PredefinedMenuItem::separator(app)?;
    let app_sep2 = PredefinedMenuItem::separator(app)?;
    let app_sep3 = PredefinedMenuItem::separator(app)?;
    let app_sep4 = PredefinedMenuItem::separator(app)?;

    let app_submenu = Submenu::with_items(
        app,
        "JSONShelf",
        true,
        &[
            &about,
            &app_sep1,
            &services,
            &app_sep2,
            &hide_i,
            &hide_others_i,
            &show_all_i,
            &app_sep3,
            &quit_item,
            &app_sep4,
        ],
    )?;

    let undo_i = PredefinedMenuItem::undo(app, None)?;
    let redo_i = PredefinedMenuItem::redo(app, None)?;
    let edit_sep = PredefinedMenuItem::separator(app)?;
    let cut_i = PredefinedMenuItem::cut(app, None)?;
    let copy_i = PredefinedMenuItem::copy(app, None)?;
    let paste_i = PredefinedMenuItem::paste(app, None)?;
    let select_all_i = PredefinedMenuItem::select_all(app, None)?;

    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &undo_i,
            &redo_i,
            &edit_sep,
            &cut_i,
            &copy_i,
            &paste_i,
            &select_all_i,
        ],
    )?;

    let minimize_i = PredefinedMenuItem::minimize(app, None)?;
    let zoom_i = PredefinedMenuItem::maximize(app, Some("Zoom"))?;
    let win_sep1 = PredefinedMenuItem::separator(app)?;
    let close_i = PredefinedMenuItem::close_window(app, None)?;
    let win_sep2 = PredefinedMenuItem::separator(app)?;
    let bring_all_i = PredefinedMenuItem::bring_all_to_front(app, None)?;

    let window_submenu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &minimize_i,
            &zoom_i,
            &win_sep1,
            &close_i,
            &win_sep2,
            &bring_all_i,
        ],
    )?;

    let menu = Menu::with_items(app, &[&app_submenu, &edit_submenu, &window_submenu])?;
    app.set_menu(menu)?;

    app.on_menu_event(|_app_handle, ev| {
        if ev.id.as_ref() == "app_quit" {
            std::process::exit(0);
        }
    });

    Ok(())
}
