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
    let quit_item = MenuItem::with_id(app, "app_quit", "退出 JSONShelf", true, Some("Cmd+Q"))?;

    // 尝试把 macOS 常见的窗口管理项一并塞进去;如果不可用就退化到只留必要的 Quit。
    // 这些 PredefinedMenuItem 在 tauri 2.11 是稳定 API,失败可能性极低。
    let about = PredefinedMenuItem::about(app, Some("JSONShelf"), None)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let hide_i = PredefinedMenuItem::hide(app, None)?;
    let hide_others_i = PredefinedMenuItem::hide_others(app, None)?;
    let show_all_i = PredefinedMenuItem::show_all(app, None)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let app_submenu = Submenu::with_items(
        app,
        "JSONShelf",
        true,
        &[
            &about,
            &sep1,
            &hide_i,
            &hide_others_i,
            &show_all_i,
            &sep2,
            &quit_item,
        ],
    )?;

    let menu = Menu::with_items(app, &[&app_submenu])?;
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
