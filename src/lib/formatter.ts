export function formatJSON(input: string, indent = 2): string {
  return JSON.stringify(JSON.parse(input), null, indent);
}

export function minifyJSON(input: string): string {
  return JSON.stringify(JSON.parse(input));
}
