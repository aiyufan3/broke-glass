import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const { VITE_SITE_URL: site } = loadEnv(mode, '.', 'VITE_')
  return {
    base: './',
    server: { strictPort: true },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'pages-social-preview',
        transformIndexHtml(html) {
          if (!site) return html
          const home = site.replace(/\/?$/, '/')
          return {
            html: html.replaceAll('content="./og-preview.png"', `content="${new URL('og-preview.png', home).href}"`),
            tags: [{ tag: 'meta', attrs: { property: 'og:url', content: home }, injectTo: 'head' }],
          }
        },
      },
    ],
  }
})
