import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/* ============================================================
   L'INSTALLATION ET LE HORS LIGNE

   L'application doit :
   - s'installer depuis un lien, comme une application normale
   - demarrer meme sans aucun reseau
   - se mettre a jour toute seule, sans intervention

   C'est la raison d'etre d'une PWA plutot que d'une application
   Android : la mise a jour ne demande jamais d'installer un
   fichier a la main.
   ============================================================ */

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg'],
      workbox: {
        /* Tout le code de l'application est mis en cache AU
           INSTALLATION, pas a la volee au premier usage. C'est ce
           qui garantit que l'application demarre dans une
           reserve sans reseau, des le premier lancement. */
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',

        /* Les images et polices : le cache d'abord, le reseau
           ensuite. Une image introuvable ne doit pas faire echouer
           l'ecran qui la contient. */
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|svg|woff2)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'gestmalin-medias', expiration: { maxEntries: 60 } },
          },
        ],

        /* On ne touche a rien d'autre : IndexedDB est la base,
           pas le cache. La regler en cache servirait a rien et
           risquerait de la vider. */
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },

      manifest: {
        name: 'Gestmalin — Stock pharmacie',
        short_name: 'Gestmalin',
        description:
          'Gestion de stock hors ligne pour pharmacie : médicaments et produits ménagers.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F6F8',
        theme_color: '#0C4A45',
        categories: ['business', 'productivity', 'medical'],
        icons: [
          { src: '/icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icone-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Réception', short_name: 'Réception', url: '/?ecran=reception' },
          { name: 'Alertes', short_name: 'Alertes', url: '/?ecran=alertes' },
          { name: 'Compter', short_name: 'Compter', url: '/?ecran=compter' },
        ],
      },
    }),
  ],
})