FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @cybersathi/api...

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
WORKDIR /repo
COPY --from=deps /repo /repo
COPY apps/api apps/api
WORKDIR /repo/apps/api
RUN pnpm prisma generate && pnpm build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/main.js"]
