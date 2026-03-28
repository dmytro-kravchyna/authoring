import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      "@bim-ide/viewer": path.resolve(__dirname, "../viewer/src/index.ts"),
    },
  },
  publicDir: path.resolve(__dirname, "../viewer/public"),
  optimizeDeps: {
    exclude: ["@thatopen/fragments"],
  },
});
