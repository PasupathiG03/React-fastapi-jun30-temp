# syntax=docker/dockerfile:1.4

# ── Stage 1: Development with Vite Hot-Reload ────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

# Cache package installation
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

EXPOSE 8106

# The port comes from FRONTEND_PORT (root .env) via vite.config.ts
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]


# ── Stage 2: Production Build ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

RUN npm run build


# ── Stage 3: Ultra-lightweight Production Web Server (Nginx) ─────────────────
FROM nginx:alpine AS production

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
