// 原生玻璃背景(macOS 26+ 的 Liquid Glass,旧系统回退到 NSVisualEffectView)。
//
// 窗口本身是 transparent 的,WebView 设为 drawsBackground=false;在 WebView 视图
// 下方插入 NSGlassEffectView(系统级液态玻璃),CSS 只负责半透明着色与高光。
// 若系统没有该 class,退回 tauri 的 HudWindow 毛玻璃效果。

use tauri::WebviewWindow;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GlassKind {
  Liquid,
  Vibrancy,
  None,
}

pub fn apply(window: &WebviewWindow) -> GlassKind {
  #[cfg(target_os = "macos")]
  {
    if macos::apply_liquid_glass(window) {
      return GlassKind::Liquid;
    }
  }

  // 回退:系统毛玻璃(10.14+ 均可)。
  let effects = tauri::window::EffectsBuilder::new()
    .effect(tauri::window::Effect::HudWindow)
    .state(tauri::window::EffectState::Active)
    .radius(0.0)
    .build();
  if window.set_effects(effects).is_ok() {
    return GlassKind::Vibrancy;
  }
  GlassKind::None
}

#[cfg(target_os = "macos")]
mod macos {
  use objc2::runtime::{AnyClass, AnyObject};
  use objc2::{class, msg_send};
  use objc2_app_kit::{NSView, NSWindow, NSWindowOrderingMode};
  use tauri::WebviewWindow;

  /// 在 WebView 下方插入 NSGlassEffectView。成功返回 true。
  pub fn apply_liquid_glass(window: &WebviewWindow) -> bool {
    // 必须在主线程调用(tauri setup / run_on_main_thread 内)。
    unsafe {
      let Ok(ptr) = window.ns_window() else { return false };
      let ns_window = &*(ptr as *const NSWindow);
      let Some(content) = ns_window.contentView() else { return false };
      let Some(cls) = AnyClass::get(c"NSGlassEffectView") else { return false };

      let glass: *mut AnyObject = msg_send![cls, alloc];
      let glass: *mut AnyObject = msg_send![glass, init];
      if glass.is_null() {
        return false;
      }

      let bounds = content.bounds();
      let _: () = msg_send![glass, setFrame: bounds];
      let _: () = msg_send![glass, setCornerRadius: 0.0f64];
      // NSViewWidthSizable | NSViewHeightSizable —— 跟随窗口尺寸。
      let _: () = msg_send![glass, setAutoresizingMask: 18usize];
      let _: () = msg_send![glass, setStyle: 0isize];

      // 轻微深色 tint,保证文字可读性;真正的明暗由 CSS 叠层控制。
      let color: *mut AnyObject = msg_send![
        class!(NSColor),
        colorWithSRGBRed: 0.035f64,
        green: 0.045f64,
        blue: 0.085f64,
        alpha: 0.42f64
      ];
      if !color.is_null() {
        let _: () = msg_send![glass, setTintColor: color];
      }

      let view: &NSView = &*(glass as *const NSView);
      content.addSubview_positioned_relativeTo(view, NSWindowOrderingMode::Below, None);
      true
    }
  }
}
