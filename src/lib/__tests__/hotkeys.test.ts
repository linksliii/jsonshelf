import { describe, it, expect } from "vitest";
import {
  parseHotkey,
  formatHotkey,
  toCodeMirror,
  toTauriAccelerator,
  hotkeyFromEvent,
  hotkeysEqual,
  type Hotkey,
} from "../hotkeys";

function hk(partial: Partial<Hotkey> & { key: string }): Hotkey {
  return {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    ...partial,
  };
}

describe("parseHotkey", () => {
  it("parses a canonical string", () => {
    expect(parseHotkey("Alt+Cmd+J")).toEqual(hk({ alt: true, meta: true, key: "J" }));
  });

  it("round-trips with formatHotkey", () => {
    const parsed = parseHotkey("Alt+Cmd+J");
    expect(parsed).not.toBeNull();
    expect(formatHotkey(parsed!)).toBe("Alt+Cmd+J");
  });

  it("is case-insensitive on modifiers and key", () => {
    expect(parseHotkey("alt+cmd+j")).toEqual(parseHotkey("Alt+Cmd+J"));
  });

  it("accepts meta aliases Meta and Super", () => {
    expect(parseHotkey("Meta+J")).toEqual(hk({ meta: true, key: "J" }));
    expect(parseHotkey("Super+J")).toEqual(hk({ meta: true, key: "J" }));
  });

  it("accepts alt aliases Option and Opt", () => {
    expect(parseHotkey("Option+J")).toEqual(hk({ alt: true, key: "J" }));
    expect(parseHotkey("Opt+J")).toEqual(hk({ alt: true, key: "J" }));
  });

  it("accepts ctrl aliases Control and Ctrl", () => {
    expect(parseHotkey("Control+J")).toEqual(hk({ ctrl: true, key: "J" }));
    expect(parseHotkey("Ctrl+J")).toEqual(hk({ ctrl: true, key: "J" }));
  });

  it("returns null when there is no non-modifier key", () => {
    expect(parseHotkey("Alt+Shift")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseHotkey("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(parseHotkey("   ")).toBeNull();
  });

  it("returns null when multiple non-modifier keys are present", () => {
    expect(parseHotkey("J+K")).toBeNull();
  });

  it("parses digits as keys", () => {
    expect(parseHotkey("Ctrl+1")).toEqual(hk({ ctrl: true, key: "1" }));
  });
});

describe("formatHotkey", () => {
  it("uses stable modifier order Ctrl+Alt+Shift+Cmd then key", () => {
    expect(
      formatHotkey(hk({ ctrl: true, alt: true, shift: true, meta: true, key: "J" }))
    ).toBe("Ctrl+Alt+Shift+Cmd+J");
  });

  it("serializes a simple combo", () => {
    expect(formatHotkey(hk({ alt: true, meta: true, key: "J" }))).toBe("Alt+Cmd+J");
  });

  it("serializes with no modifiers", () => {
    expect(formatHotkey(hk({ key: "F" }))).toBe("F");
  });
});

describe("toCodeMirror", () => {
  it("orders Mod, Ctrl, Shift, Alt then lowercased key", () => {
    expect(toCodeMirror(hk({ shift: true, alt: true, key: "F" }))).toBe("Shift-Alt-f");
  });

  it("maps meta to Mod", () => {
    expect(toCodeMirror(hk({ meta: true, key: "S" }))).toBe("Mod-s");
  });

  it("full order Mod-Ctrl-Shift-Alt", () => {
    expect(
      toCodeMirror(hk({ ctrl: true, alt: true, shift: true, meta: true, key: "J" }))
    ).toBe("Mod-Ctrl-Shift-Alt-j");
  });
});

describe("toTauriAccelerator", () => {
  it("orders Ctrl, Alt, Shift, then Cmd for meta, key as-is uppercase", () => {
    expect(toTauriAccelerator(hk({ alt: true, meta: true, key: "J" }))).toBe("Alt+Cmd+J");
  });

  it("full order Ctrl+Alt+Shift+Cmd", () => {
    expect(
      toTauriAccelerator(hk({ ctrl: true, alt: true, shift: true, meta: true, key: "K" }))
    ).toBe("Ctrl+Alt+Shift+Cmd+K");
  });
});

describe("hotkeyFromEvent", () => {
  it("builds a Hotkey from a combo event", () => {
    expect(
      hotkeyFromEvent({
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
        metaKey: true,
        key: "j",
        code: "KeyJ",
      })
    ).toEqual(hk({ alt: true, meta: true, key: "J" }));
  });

  it("returns null for a modifier-only press", () => {
    const codes: Record<string, string> = {
      Shift: "ShiftLeft",
      Control: "ControlLeft",
      Alt: "AltLeft",
      Meta: "MetaLeft",
    };
    for (const key of ["Shift", "Control", "Alt", "Meta"]) {
      expect(
        hotkeyFromEvent({
          ctrlKey: false,
          altKey: false,
          shiftKey: true,
          metaKey: false,
          key,
          code: codes[key],
        })
      ).toBeNull();
    }
  });

  it("returns null for an empty key with no usable code", () => {
    expect(
      hotkeyFromEvent({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, key: "", code: "" })
    ).toBeNull();
  });

  it("normalizes single letters to uppercase", () => {
    expect(
      hotkeyFromEvent({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: "s", code: "KeyS" })
    ).toEqual(hk({ ctrl: true, key: "S" }));
  });

  it("derives the physical key from code despite macOS Option composition", () => {
    // ⌥⇧F on macOS composes e.key into "Ï"; e.code stays "KeyF".
    expect(
      hotkeyFromEvent({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, key: "Ï", code: "KeyF" })
    ).toEqual(hk({ alt: true, shift: true, ctrl: false, meta: false, key: "F" }));
  });

  it("derives digits from code", () => {
    expect(
      hotkeyFromEvent({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: "1", code: "Digit1" })
    ).toEqual(hk({ ctrl: true, key: "1" }));
  });

  it("falls back to key when code is absent", () => {
    expect(
      hotkeyFromEvent({ ctrlKey: false, altKey: true, shiftKey: false, metaKey: true, key: "j" })
    ).toEqual(hk({ alt: true, meta: true, key: "J" }));
  });
});

describe("hotkeysEqual", () => {
  it("returns true for identical combos", () => {
    expect(
      hotkeysEqual(hk({ alt: true, meta: true, key: "J" }), hk({ alt: true, meta: true, key: "J" }))
    ).toBe(true);
  });

  it("returns false when modifiers differ", () => {
    expect(
      hotkeysEqual(hk({ alt: true, key: "J" }), hk({ alt: true, meta: true, key: "J" }))
    ).toBe(false);
  });

  it("returns false when keys differ", () => {
    expect(hotkeysEqual(hk({ key: "J" }), hk({ key: "K" }))).toBe(false);
  });
});
