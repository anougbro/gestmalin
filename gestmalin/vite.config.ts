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

export default defineConfig(({ mode }) => {
  /* Vite remplace `%BASE_PATH%` dans index.html au build. Une
     seule source de verite pour le chemin, plutot qu'une copie
     ecroute a la main dans le HTML — c'est exactement le genre
     de duplication qui casse en silence. */
  const base = process.env.BASE_PATH ?? '/'
  void mode

  return {
  base,

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
        name: 'Gestmalin - Stock pharmacie',
        short_name: 'Gestmalin',
        description:
          'Gestion de stock hors ligne pour pharmacie : médicaments et produits ménagers.',
        lang: 'fr',
        /* `id` fixe l'identite de l'application. Sans lui, le
           navigateur en fabrique une a partir de `start_url`, et
           une installation deja faite n'est plus reconnue comme la
           meme application si le chemin change. */
        id: base,
        /* `start_url` et `scope` doivent porter le chemin de base.
           Ecrits en `/`, ils ouvrent la racine du domaine — la
           page blanche de GitHub, pas l'application. */
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F6F8',
        theme_color: '#0C4A45',
        categories: ['business', 'productivity', 'medical'],
        icons: [
          { src: `${base}icone.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: `${base}icone-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icone-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icone-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Réception', short_name: 'Réception', url: `${base}?ecran=reception` },
          { name: 'Alertes', short_name: 'Alertes', url: `${base}?ecran=alertes` },
          { name: 'Compter', short_name: 'Compter', url: `${base}?ecran=compter` },
        ],
      },
    }),
  ],
  }
})