// 历史面板宽度约束。拖拽调整宽度时用 clampWidth 收敛到 [MIN, MAX];
// 低于 COLLAPSE_THRESHOLD 视为"拖到最窄即收起",由调用方转为 panelHidden。
export const PANEL_MIN = 180;
export const PANEL_MAX = 520;
export const PANEL_DEFAULT = 280;
export const PANEL_COLLAPSE_THRESHOLD = 140;

export function clampWidth(w: number): number {
  if (w < PANEL_MIN) return PANEL_MIN;
  if (w > PANEL_MAX) return PANEL_MAX;
  return w;
}
