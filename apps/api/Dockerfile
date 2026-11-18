FROM node:22-alpine3.22 AS deps
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @cybersathi/api...

FROM node:22-alpine3.22 AS build
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
WORKDIR /repo
COPY --from=deps /repo /repo
COPY apps/api apps/api
WORKDIR /repo/apps/api
RUN pnpm prisma generate && pnpm build

FROM node:22-alpine3.22 AS runner
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
RUN apk add --no-cache imagemagick font-dejavu font-noto-devanagari \
  && magick -version | grep -Eq '^Version: ImageMagick 7' \
  && test -f /usr/share/fonts/dejavu/DejaVuSans.ttf \
  && test -f /usr/share/fonts/dejavu/DejaVuSans-Bold.ttf \
  && test -f /usr/share/fonts/noto/NotoSansDevanagari-Regular.ttf
WORKDIR /repo
ENV NODE_ENV=production
ENV IMAGE_FONT_REGULAR=/usr/share/fonts/dejavu/DejaVuSans.ttf
ENV IMAGE_FONT_BOLD=/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf
ENV IMAGE_FONT_DEVANAGARI=/usr/share/fonts/noto/NotoSansDevanagari-Regular.ttf
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
