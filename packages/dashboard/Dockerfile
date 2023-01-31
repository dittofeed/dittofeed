# Install dependencies only when needed
FROM node:16.14.2 AS deps

WORKDIR /app

COPY *.json yarn.lock ./
COPY ./packages/dashboard/*.json ./packages/dashboard/
COPY ./packages/backend-lib/*.json ./packages/backend-lib/
COPY ./packages/isomorphic-lib/*.json ./packages/isomorphic-lib/

RUN yarn install --frozen-lockfile

# Rebuild the source code only when needed
FROM node:16.14.2 AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN yarn workspace isomorphic-lib build && \
    yarn workspace backend-lib prisma generate && \
    yarn workspace backend-lib build && \
    yarn workspace dashboard build

# Production image, copy all the files and run next
FROM node:16.14.2 AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1


# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/packages/dashboard/.next/standalone/packages/dashboard ./
COPY --from=builder /app/packages/dashboard/.next/standalone/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# static and public should be on CDN
COPY --from=builder /app/packages/dashboard/.next/static ./.next/static
COPY --from=builder /app/packages/dashboard/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
