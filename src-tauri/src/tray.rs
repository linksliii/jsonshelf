use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

/// 安装 macOS 状态栏图标 + 菜单。
///
/// 菜单项:呼出面板 / 新建 / 设置 / --- / 退出。
/// - 呼出面板:show + focus 主窗口。
/// - 新建/设置:show + focus 主窗口,再向前端 emit `tray:new` / `tray:settings`,
///   由 App.tsx 的监听器分别调用 handleNew / 打开设置面板。
/// - 退出:std::process::exit(0),不经过 RunEvent::ExitRequested。
///
/// 图标复用应用默认窗口图标(彩色);未设置 icon_as_template(彩色图标不适合
/// 模板模式)。后续如替换为专用单色 PNG 可再开启 `icon_as_template(true)`。
pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "tray_show", "呼出面板", true, None::<&str>)?;
    let new_i = MenuItem::with_id(app, "tray_new", "新建", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "tray_settings", "设置", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "tray_quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &new_i, &settings_i, &sep, &quit_i])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray_show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "tray_new" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                    let _ = w.emit("tray:new", ());
                }
            }
            "tray_settings" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                    let _ = w.emit("tray:settings", ());
                }
            }
            "tray_quit" => {
                // 直接终止进程:绕过 RunEvent::ExitRequested(那条路径被
                // 用来拦截 Dock 右键退出改为隐藏)。
                std::process::exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

/// 安装自定义 macOS 应用主菜单,替换默认菜单里的 Quit 项,把 Cmd+Q 绑定到
/// 一个我们自己控制的菜单项 `app_quit` —— 处理器调用 `std::process::exit(0)`
/// 直接结束进程,从而不走 RunEvent::ExitRequested。(不能用 AppHandle::exit,
/// 它会触发 ExitRequested,进而被 .run() 里的拦截器 hide 掉,窗口关但进程活。)
///
/// 结合 lib.rs 里的 ExitRequested 处理器(拦截 + 隐藏窗口),达到:
/// - Cmd+Q → app_quit → 真正退出
/// - Dock 右键 Quit → RunEvent::ExitRequested → 拦截并隐藏
/// - 状态栏"退出" → std::process::exit(0) → 真正退出
pub fn setup_app_menu(app: &tauri::App) -> tauri::Result<()> {
    // 我们自己控制的 Quit 项 —— Cmd+Q 走 std::process::exit(0),绕开 ExitRequested。
    // 注意:必须放在 App 子菜单最后,并且不使用 PredefinedMenuItem::quit(那个走
    // NSApp terminate 会触发 ExitRequested,被 .run() 拦截为隐藏,导致 Cmd+Q 失效)。
    let quit_item = MenuItem::with_id(app, "app_quit", "退出 JSONShelf", true, Some("Cmd+Q"))?;

    // ---- App 子菜单("JSONShelf") ----
    // macOS 会把第一个子菜单的标题自动替换为应用真实名称,这里传 "JSONShelf" 兜底。
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
            &quit_item, // Cmd+Q -> app_quit -> std::process::exit(0)
            &app_sep4,  // 分隔用,防止某些语言环境把 Quit 与后续项合并渲染
        ],
    )?;

    // ---- Edit 子菜单 ----
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

    // ---- Window 子菜单 ----
    // close_window 会向当前聚焦的窗口派发标准 CloseRequested 事件,
    // 我们在 window.rs::setup_close_to_hide 里拦截并 hide,从而 Cmd+W = 隐藏窗口。
    let minimize_i = PredefinedMenuItem::minimize(app, None)?;
    let zoom_i = PredefinedMenuItem::maximize(app, Some("Zoom"))?; // macOS 语境的 Zoom
    let win_sep1 = PredefinedMenuItem::separator(app)?;
    let close_i = PredefinedMenuItem::close_window(app, None)?; // Cmd+W
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
            // 直接终止进程,不经过 Tauri 事件循环。
            // 注意:AppHandle::exit(0) 会先触发 RunEvent::ExitRequested(见 tauri
            // 2.11.5 src/app.rs 的文档),而 ExitRequested 已被 .run() 闭包拦截为
            // "prevent + 隐藏窗口"用于处理 Dock 右键 Quit;若这里用 app.exit(0),
            // Cmd+Q 也会被同一路径拦截而无法真正退出。std::process::exit(0) 直接
            // 调 libc 退出进程,绕开 ExitRequested,与状态栏"退出"分支保持一致。
            std::process::exit(0);
        }
    });

    Ok(())
}
