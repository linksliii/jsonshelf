export function formatJSON(input: string, indent = 2): string {
  const parsed = JSON.parse(input);
  return JSON.stringify(parsed, null, indent);
}

export function minifyJSON(input: string): string {
  const parsed = JSON.parse(input);
  return JSON.stringify(parsed);
}

// 非 JSON 语言:动态导入 Prettier,失败则抛错由调用方降级
export async function formatOther(input: string, language: string): Promise<string> {
  const prettier = await import("prettier/standalone");
  const parserMap: Record<string, () => Promise<any>> = {
    yaml: () => import("prettier/plugins/yaml"),
    html: () => import("prettier/plugins/html"),
    css: () => import("prettier/plugins/postcss"),
    babel: () => import("prettier/plugins/babel"),
  };
  const parserKeyMap: Record<string, string> = {
    yaml: "yaml", html: "html", css: "css", javascript: "babel", js: "babel",
  };
  const pluginLoader = parserMap[parserKeyMap[language] ?? language];
  if (!pluginLoader) throw new Error(`unsupported language: ${language}`);
  const plugin = await pluginLoader();
  const estree = language === "javascript" || language === "js"
    ? await import("prettier/plugins/estree")
    : null;
  return prettier.format(input, {
    parser: parserKeyMap[language] ?? language,
    plugins: estree ? [plugin.default ?? plugin, estree.default ?? estree] : [plugin.default ?? plugin],
  });
}
