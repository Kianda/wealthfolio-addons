import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const addon = process.env.ADDON;
if (!addon) throw new Error("ADDON env var required (e.g. ADDON=composition vite build)");

/**
 * Packages the 3.6 sandbox provides to the addon iframe at runtime. Keep this
 * list in sync with HOST_DEPENDENCIES in @wealthfolio/addon-sdk and with the
 * `hostDependencies` block in each addon's manifest.json.
 *
 * Anything not listed here is bundled into addon.js. Bundling react or
 * react-dom would give the addon a second React instance and break hooks;
 * bundling @wealthfolio/ui just makes the artifact needlessly large.
 */
const hostProvidedDependencies = [
  "@tanstack/react-query",
  "@wealthfolio/addon-sdk",
  "@wealthfolio/addon-sdk/host-api",
  "@wealthfolio/addon-sdk/host-dependencies",
  "@wealthfolio/addon-sdk/manifest",
  "@wealthfolio/addon-sdk/permissions",
  "@wealthfolio/addon-sdk/types",
  "@wealthfolio/addon-sdk/utils",
  "@wealthfolio/ui",
  "@wealthfolio/ui/chart",
  "date-fns",
  "lucide-react",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-dev-runtime",
  "react/jsx-runtime",
  "recharts",
];

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
      // ESM externals, bare specifiers. The old rollup-plugin-external-globals
      // mapping (react -> window.React) no longer applies: the sandbox has no
      // globals, it resolves these bare imports itself.
      external: hostProvidedDependencies,
    },
    outDir: `addons/${addon}/dist`,
    minify: false,
    sourcemap: true,
  },
});
