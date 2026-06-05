import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    target: "node20",
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "main.js"
    },
    rollupOptions: {
      external: [/^node:/]
    }
  }
});

