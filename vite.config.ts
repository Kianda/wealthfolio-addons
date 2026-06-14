import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import externalGlobals from "rollup-plugin-external-globals";

const addon = process.env.ADDON;
if (!addon) throw new Error("ADDON env var required (e.g. ADDON=composition vite build)");

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: `addons/${addon}/src/addon.tsx`,
      fileName: () => "addon.js",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      plugins: [
        externalGlobals({
          react: "React",
          "react-dom": "ReactDOM",
        }),
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    outDir: `addons/${addon}/dist`,
    minify: false,
    sourcemap: true,
  },
});
