import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "esavitarna – darbuotojo savitarna",
        short_name: "esavitarna",
        lang: "lt",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1565c0",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: {
    port: 5174,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
});
