import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The vault is meant to be opened in a kitchen; a stale shell after a
      // deploy is worse than a reload, so take updates as soon as they land.
      registerType: 'autoUpdate',
      // main.tsx registers the worker through virtual:pwa-register so it can
      // reload the page when a new one takes over; the auto-injected
      // registerSW.js script would register a second time.
      injectRegister: null,
      includeAssets: ['app-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'The Family Recipe Vault',
        short_name: 'The Vault',
        description: 'The family cookbook: 200+ preserved recipes, meal plans, and what everyone has actually cooked.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#ea580c',
        // Matches the app's slate-50 page background, so the launch splash
        // doesn't flash white before the shell paints.
        background_color: '#f8fafc',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Android crops icons to its own shape; the full-bleed variants keep
          // the hat clear of the crop.
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // SPA routes like /recipes/:id have no file on disk.
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Food photos and scanned recipe cards, so an offline kitchen still
            // sees them. Deliberately scoped to public Storage objects only --
            // auth and REST traffic must never be served from a cache.
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'recipe-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
