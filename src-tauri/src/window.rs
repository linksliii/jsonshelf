use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, WebviewWindow};

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

/// 判断当前进程是否被系统隐藏(⌘H / 菜单 Hide)。
/// 被隐藏时,单纯 orderFront 不会让窗口出现,必须先 unhide 并激活 App。
#[cfg(target_os = "macos")]
fn app_hidden() -> bool {
  use objc2::MainThreadMarker;
  use objc2_app_kit::NSApplication;
  match MainThreadMarker::new() {
    Some(mtm) => NSApplication::sharedApplication(mtm).isHidden(),
    None => false,
  }
}

#[cfg(not(target_os = "macos"))]
fn app_hidden() -> bool {
  false
}

/// App 当前是否是前台应用;以及主窗口是不是键盘焦点窗口。
/// 比 tauri 的 is_focused 更贴近"用户看到的最前面那个窗口"。
#[cfg(target_os = "macos")]
fn app_active_and_key(window: &WebviewWindow) -> (bool, bool) {
  use objc2::MainThreadMarker;
  use objc2_app_kit::{NSApplication, NSWindow};
  let Some(mtm) = MainThreadMarker::new() else { return (false, false) };
  let app = NSApplication::sharedApplication(mtm);
  let active = app.isActive();
  let key = unsafe {
    match (app.keyWindow(), window.ns_window()) {
      (Some(key), Ok(ptr)) => {
        let win = &*(ptr as *const NSWindow);
        std::ptr::eq(&*key as *const NSWindow, win as *const NSWindow)
      }
      _ => false,
    }
  };
  (active, key)
}

#[cfg(not(target_os = "macos"))]
fn app_active_and_key(_window: &WebviewWindow) -> (bool, bool) {
  (true, false)
}

/// 同步地把窗口带到最前并激活 App。全部走 AppKit 原生调用,
/// 避免 show()/set_focus() 经事件循环排队后先后顺序被打乱导致"呼出无反应"。
#[cfg(target_os = "macos")]
fn activate_window(window: &WebviewWindow) {
  use objc2::MainThreadMarker;
  use objc2_app_kit::{NSApplication, NSWindow};
  unsafe {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let ns_app = NSApplication::sharedApplication(mtm);
    if ns_app.isHidden() {
      ns_app.unhide(None);
    }
    if let Ok(ptr) = window.ns_window() {
      let ns_window = &*(ptr as *const NSWindow);
      if ns_window.isMiniaturized() {
        ns_window.deminiaturize(None);
      }
      // 先把窗口提到最前(即使 App 还没激活),再请求激活;
      // macOS 14+ 的 activateIgnoringOtherApps 已废弃,单靠它经常不生效。
      ns_window.orderFrontRegardless();
      ns_window.makeKeyAndOrderFront(None);
    }
    #[allow(deprecated)]
    ns_app.activateIgnoringOtherApps(true);
    ns_app.activate();
  }
}

#[cfg(not(target_os = "macos"))]
fn activate_window(_window: &WebviewWindow) {}

/// 保证窗口整块落在某块屏幕的可用区域里。
///
/// 处理这几类真实故障:换了显示器 / 分辨率变化 / window-state 恢复出一个
/// 比屏幕还大的窗口,导致标题栏跑到屏幕外,用户以为"快捷键没反应"。
/// 只要有任何一部分越界,就把窗口收缩并居中到主屏(数据不会动)。
pub fn ensure_on_screen(window: &WebviewWindow) {
  let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
    return;
  };

  let monitors = window.available_monitors().unwrap_or_default();
  let fully_visible = monitors.iter().any(|m| {
    let wa = m.work_area();
    let wx0 = wa.position.x;
    let wy0 = wa.position.y;
    let wx1 = wx0 + wa.size.width as i32;
    let wy1 = wy0 + wa.size.height as i32;
    pos.x >= wx0 - 2
      && pos.y >= wy0 - 2
      && pos.x + size.width as i32 <= wx1 + 2
      && pos.y + size.height as i32 <= wy1 + 2
  });
  if fully_visible {
    return;
  }

  let Some(primary) = window.primary_monitor().ok().flatten() else {
    return;
  };
  let wa = primary.work_area();
  let max_w = wa.size.width.saturating_sub(64);
  let max_h = wa.size.height.saturating_sub(64);
  let w = size.width.min(max_w).max(720.min(max_w));
  let h = size.height.min(max_h).max(440.min(max_h));
  if w != size.width || h != size.height {
    let _ = window.set_size(tauri::PhysicalSize::new(w, h));
  }
  let x = wa.position.x + ((wa.size.width.saturating_sub(w)) / 2) as i32;
  let y = wa.position.y + ((wa.size.height.saturating_sub(h)) / 2) as i32;
  let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
}

/// 显示并聚焦面板。必须在主线程调用。
pub fn show_panel(app: &AppHandle, window: &WebviewWindow) {
  ensure_on_screen(window);
  let _ = window.show();
  activate_window(window);
  // 再补一次:窗口 show 是排队执行的,激活可能早于窗口真正 orderFront。
  // 让主线程在下一拍再激活一次,覆盖 macOS 14+ 的协作式激活偶发被忽略。
  let handle = app.clone();
  let _ = app.run_on_main_thread(move || {
    if let Some(w) = handle.get_webview_window("main") {
      let _ = w.set_focus();
      activate_window(&w);
    }
  });
}

/// 全局快捷键的 toggle:
/// - 窗口在屏幕最前且 App 未隐藏 → 收起;
/// - 其它情况(被遮挡 / 最小化 / App 被 ⌘H 隐藏 / 在别的 Space)→ 呼出并激活。
/// 这样"按一下没反应"的情况不会再出现。
pub fn toggle_panel(app: &AppHandle, window: &WebviewWindow) {
  LAST_TOGGLE_MS.store(now_ms(), Ordering::Relaxed);
  let visible = window.is_visible().unwrap_or(false);
  let hidden = app_hidden();
  let (active, key) = app_active_and_key(window);

  // 只有"窗口确实在最前 + App 处于激活状态"才收起;
  // 窗口可见但被别的应用压住时,应该把它拉到前台,而不是藏起来。
  let should_hide = visible && !hidden && active && key;

  if should_hide {
    let _ = window.hide();
  } else {
    show_panel(app, window);
  }
}

/// 拦截主窗口的关闭请求(红色关闭按钮 / Cmd+W)→ 阻止关闭并改为隐藏。
pub fn setup_close_to_hide(app: &tauri::App) {
  if let Some(win) = app.get_webview_window("main") {
    let w = win.clone();
    win.on_window_event(move |event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = w.hide();
      }
    });
  }
}

pub fn setup_blur_hide(app: &tauri::App) {
  if let Some(win) = app.get_webview_window("main") {
    let w = win.clone();
    win.on_window_event(move |event| {
      // 被系统放回异次元(换了显示器/分辨率)时,一获得焦点就拉回可见区域。
      if let tauri::WindowEvent::Focused(true) = event {
        ensure_on_screen(&w);
      }
      if let tauri::WindowEvent::Focused(false) = event {
        if !HIDE_ON_BLUR.load(Ordering::Relaxed) {
          return;
        }
        if now_ms() - LAST_TOGGLE_MS.load(Ordering::Relaxed) < 300 {
          return;
        }
        let _ = w.hide();
      }
    });
  }
}
