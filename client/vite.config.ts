import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Hearth",
        short_name: "Hearth",
        description: "Universal AI terminal — your computer in the cloud",
        theme_color: "#0f1117",
        background_color: "#0f1117",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // The on-device model engine (WebLLM) is large and loaded on demand —
        // don't precache it in the service worker.
        globIgnores: ["**/webllm-*.js"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\./,
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@mlc-ai/web-llm")) return "webllm";
        },
      },
    },
  },
  server: {
    proxy: {
      "/pty": { target: "ws://localhost:3001", ws: true },
      "/api": { target: "http://localhost:3001" },
    },
  },
});
