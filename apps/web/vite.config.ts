import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Service workers make local dev confusing (stale precache, extra devtools noise) and add
      // nothing there — HMR already serves fresh assets. Flip to true only when actively testing
      // the service worker itself.
      devOptions: { enabled: false },
      // 'autoUpdate' would swap the cached shell out from under an open tab with no warning — a
      // stale shell talking to a newer API is exactly the hazard this task calls out. 'prompt'
      // pairs with the UpdatePrompt banner (App.tsx) so a redeploy surfaces a reload control
      // instead of silently reloading or silently doing nothing.
      registerType: 'prompt',
      // The server serves index.html for unmatched non-/api GETs (errorHandler.ts), so the SW's
      // own navigation fallback must never intercept /api or /socket.io — doing so would silently
      // swallow REST calls or WebSocket traffic. navigateFallbackDenylist covers the fallback
      // itself; excluding both from globPatterns/runtime caching keeps them out of precache too.
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
      },
      manifest: {
        name: 'Ubiquiti Todo',
        short_name: 'Todo',
        description: 'Realtime, offline-capable shared todo lists',
        theme_color: '#6366f1',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
