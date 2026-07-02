FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm turbo

# Stage 1: Prune workspace
FROM base AS pruner
COPY . .
RUN turbo prune --scope=api --scope=web --docker

# Stage 2: Install and build
FROM base AS builder
# Install system deps for prisma
RUN apk add --no-cache openssl
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
# Generate prisma client
RUN cd packages/database && pnpm exec prisma generate
# Build all packages and apps
RUN pnpm turbo run build --filter=api... --filter=web...

# Stage 3: API Production Image
FROM base AS api
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/main.js"]

# Stage 4: Web Production Image
FROM base AS web
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web ./apps/web
EXPOSE 3000
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "web", "start"]
