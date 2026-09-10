import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";

export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false
    })
  ],
  // Recharts was hydrating against a second, half-initialised copy of React and
  // throwing "Cannot read properties of null (reading 'useState')", which killed
  // the whole MetricsTab island -- the tiles kept their server-rendered numbers
  // and every chart stayed an empty box. Deduping React and pre-bundling recharts
  // against the same instance fixes it in dev and in the build.
  vite: {
    resolve: {
      dedupe: ["react", "react-dom", "react-is"]
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react-is", "recharts"]
    },
    ssr: {
      noExternal: ["recharts"]
    }
  }
});
