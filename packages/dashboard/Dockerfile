FROM node:18.4.0 AS builder

WORKDIR /app

COPY . .

RUN yarn workspaces focus isomorphic-lib && \
    yarn workspaces focus backend-lib && \
    yarn workspaces focus dashboard

RUN yarn workspace isomorphic-lib build && \
    yarn workspace backend-lib prisma generate && \
    yarn workspace backend-lib build && \
    yarn workspace dashboard build

FROM node:18.4.0 AS dev

WORKDIR /app

RUN yarn

# Production image, copy all the files and run next
FROM node:18.4.0 AS runner

WORKDIR /app

ENV NODE_ENV=production

# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/packages/dashboard/.next/standalone/packages/dashboard ./
COPY --from=builder /app/packages/dashboard/.next/standalone/node_modules ./node_modules
# static and public should be on CDN
COPY --from=builder /app/packages/dashboard/.next/static ./.next/static
COPY --from=builder /app/packages/dashboard/public ./public

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["node", "server.js"]
