import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "site",
  base: process.env.GITHUB_PAGES === "true" ? "/GitPulse/" : "/",
  plugins: [react()],
  build: {
    outDir: "../site-dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("/react/") || id.includes("/react-dom/")) {
            return "react-vendor";
          }

          if (id.includes("/lucide-react/")) {
            return "icons";
          }
        },
      },
    },
  },
  server: {
    port: 5174,
    host: "127.0.0.1",
  },
  preview: {
    port: 4174,
    host: "127.0.0.1",
  },
});
