import { defineConfig, loadEnv, type Plugin } from 'vite'
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

// Address of the backend API, baked into the app as API_BASE_URL and allowed in the Content-Security-Policy below.
// Leave API_URL unset (the default): the browser then calls the API on the same host it opened the app from,
// the BACKEND_PORT, so the app works on any machine / IP address without a rebuild. Set API_URL in the root .env
// only if the API lives somewhere else (e.g. API_URL=https://api.example.com).
// Ports (FRONTEND_PORT, BACKEND_PORT) and API_URL come from the root .env; Docker passes them as environment variables.
const rootEnv = (mode: string) => loadEnv(mode, path.resolve(import.meta.dirname, '..'), '')
const buildCsp = (apiOrigin: string) => [
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
function cspMetaTag(contentSecurityPolicy: string): Plugin {
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

export default defineConfig(({ mode }) => {
  const env = rootEnv(mode)
  const FRONTEND_PORT = Number(env.FRONTEND_PORT) || 8106
  const BACKEND_PORT = Number(env.BACKEND_PORT) || 8107
  const API_URL = env.API_URL ?? ''
  const contentSecurityPolicy = buildCsp(API_URL || `http://*:${BACKEND_PORT} https://*:${BACKEND_PORT}`)
  return {
  plugins: [react(), tailwindcss(), cspMetaTag(contentSecurityPolicy)],
  define: {
    __API_URL__: JSON.stringify(API_URL),
    __API_PORT__: JSON.stringify(String(BACKEND_PORT)),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: FRONTEND_PORT,
    headers: baseSecurityHeaders,
    watch: {
      usePolling: true,
    },
  },
  preview: {
    headers: { ...baseSecurityHeaders, 'Content-Security-Policy': contentSecurityPolicy },
  },
  }
})
