export function autoTitle(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return `array[${parsed.length}]`;
    if (parsed && typeof parsed === "object") {
      const keys = Object.keys(parsed);
      if (keys.length > 0) return keys[0].slice(0, 40);
    }
    return "Untitled";
  } catch {
    return "Untitled";
  }
}
