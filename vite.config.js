import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base relativo ('./') funciona tanto em GitHub Pages (subdiretório do repo)
// quanto em qualquer outro host estático. Como usamos HashRouter, o roteamento
// não depende do caminho base.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'ISAE4 Competição — Nat vs Ang',
        short_name: 'ISAE4',
        description: 'Disputa de investimentos entre Nat e Ang no ativo ISAE4, comparada ao cenário passivo Buffet.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#4f46e5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.href.includes('finance.yahoo.com') || url.href.includes('allorigins'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'quotes-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 }
            }
          }
        ]
      }
    })
  ]
})
