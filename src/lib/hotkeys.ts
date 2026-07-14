export interface Hotkey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean; // Cmd on macOS
  key: string; // single key, uppercase letter/digit or named key like "F", "J", "S"
}

const MODIFIER_ALIASES: Record<string, keyof Hotkey> = {
  CTRL: "ctrl",
  CONTROL: "ctrl",
  ALT: "alt",
  OPT: "alt",
  OPTION: "alt",
  SHIFT: "shift",
  CMD: "meta",
  META: "meta",
  SUPER: "meta",
};

// Keys that are modifiers by themselves and cannot stand as the bound key.
const MODIFIER_EVENT_KEYS = new Set(["SHIFT", "CONTROL", "ALT", "META"]);

/**
 * Parse a canonical "+"-joined shortcut string (e.g. "Alt+Cmd+J").
 * Modifier names are case-insensitive and accept common aliases.
 * Returns null if there is no single non-modifier key or the string is malformed.
 */
export function parseHotkey(s: string): Hotkey | null {
  const parts = s.split("+").map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) return null;

  const h: Hotkey = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
  let keyCount = 0;

  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toUpperCase()];
    if (modifier) {
      (h[modifier] as boolean) = true;
    } else {
      keyCount += 1;
      h.key = part.toUpperCase();
    }
  }

  if (keyCount !== 1) return null;
  return h;
}

/**
 * Canonical serialize: stable modifier order Ctrl+Alt+Shift+Cmd then key, "+"-joined.
 */
export function formatHotkey(h: Hotkey): string {
  const parts: string[] = [];
  if (h.ctrl) parts.push("Ctrl");
  if (h.alt) parts.push("Alt");
  if (h.shift) parts.push("Shift");
  if (h.meta) parts.push("Cmd");
  parts.push(h.key);
  return parts.join("+");
}

/**
 * CodeMirror keymap format: meta -> "Mod", order Mod/Ctrl/Shift/Alt then lowercased key,
 * "-"-joined. e.g. {shift,alt,key:"F"} -> "Shift-Alt-f", {meta,key:"S"} -> "Mod-s".
 */
export function toCodeMirror(h: Hotkey): string {
  const parts: string[] = [];
  if (h.meta) parts.push("Mod");
  if (h.ctrl) parts.push("Ctrl");
  if (h.shift) parts.push("Shift");
  if (h.alt) parts.push("Alt");
  parts.push(h.key.toLowerCase());
  return parts.join("-");
}

/**
 * Tauri global-shortcut accelerator format: order Ctrl/Alt/Shift then meta as "Cmd",
 * then key as-is (uppercase), "+"-joined. e.g. {alt,meta,key:"J"} -> "Alt+Cmd+J".
 */
export function toTauriAccelerator(h: Hotkey): string {
  const parts: string[] = [];
  if (h.ctrl) parts.push("Ctrl");
  if (h.alt) parts.push("Alt");
  if (h.shift) parts.push("Shift");
  if (h.meta) parts.push("Cmd");
  parts.push(h.key);
  return parts.join("+");
}

/**
 * Derive a stable, layout-independent key from KeyboardEvent.code (the physical key).
 * Unlike e.key, e.code is NOT affected by macOS Option composition (e.g. ⌥⇧F yields
 * key "Ï" but code "KeyF"). Returns an uppercase letter/digit, or null for lone
 * modifier codes / unmapped codes.
 *   KeyA..KeyZ -> A..Z, Digit0..Digit9 -> 0..9, ShiftLeft/AltRight/... -> null.
 */
function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return null;
}

/**
 * Build a Hotkey from a keyboard-event-like object. Prefers `code` (physical key,
 * immune to macOS Option composition) when it maps to a letter/digit; otherwise
 * falls back to `key`. Returns null if the pressed key is itself only a modifier
 * or empty. The key is normalized to uppercase.
 */
export function hotkeyFromEvent(e: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
  code?: string;
}): Hotkey | null {
  let key: string | null = e.code ? keyFromCode(e.code) : null;
  if (!key) {
    if (!e.key) return null;
    if (MODIFIER_EVENT_KEYS.has(e.key.toUpperCase())) return null;
    key = e.key.toUpperCase();
  }
  return {
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
    key,
  };
}

/**
 * Structural equality of two hotkeys (for conflict detection).
 */
export function hotkeysEqual(a: Hotkey, b: Hotkey): boolean {
  return (
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta &&
    a.key === b.key
  );
}
