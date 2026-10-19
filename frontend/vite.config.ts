import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Headers for the page itself (the API adds its own). Vite's dev server needs inline scripts and websockets
// for hot reload, so the strict Content-Security-Policy is only sent by `vite preview` / production hosts.
const baseSecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
}

// Address of the backend API. This is the one place to change it (there is no .env file in the frontend);
// it is baked into the app as API_BASE_URL and also allowed in the Content-Security-Policy below.
const API_URL = 'http://localhost:8107'
const apiOrigin = API_URL
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

// The built index.html carries the policy itself as a <meta> tag, so the CSP is enforced on whatever server
// hosts dist/ (nginx, IIS, a CDN...), even one that sends no headers. Build only: the dev server needs
// inline scripts for hot reload. frame-ancestors is ignored inside <meta>, so it stays a header (preview /
// your host) -- X-Frame-Options: DENY covers clickjacking either way.
function cspMetaTag(): Plugin {
  const metaPolicy = contentSecurityPolicy
    .split('; ')
    .filter((d) => !d.startsWith('frame-ancestors'))
    .join('; ')
  return {
    name: 'csp-meta-tag',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: metaPolicy }, injectTo: 'head-prepend' },
      ],
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMetaTag()],
  define: {
    __API_URL__: JSON.stringify(API_URL),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 8106,
    headers: baseSecurityHeaders,
  },
  preview: {
    headers: { ...baseSecurityHeaders, 'Content-Security-Policy': contentSecurityPolicy },
  },
})
