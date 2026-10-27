import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 体积优先:不做无谓降级,输出单份 CSS。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "safari18", cssCodeSplit: false },
});
