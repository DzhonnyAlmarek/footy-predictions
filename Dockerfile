# Next.js standalone deployment for Yandex Serverless Containers.
# Public Supabase settings are embedded by Next.js at build time.
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Never bake production Supabase settings into the isolated test image.
# Non-routable placeholders satisfy legacy build-time imports only.
ENV NEXT_PUBLIC_SUPABASE_URL=https://isolated.invalid
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=test-only-placeholder-not-a-real-key
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DEPLOY_TARGET=yandex-neon-test
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
