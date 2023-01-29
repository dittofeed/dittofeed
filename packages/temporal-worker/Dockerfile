# Rebuild the source code only when needed
FROM node:16.14.2 AS builder

WORKDIR /service

COPY *.json yarn.lock ./
COPY ./packages/temporal-worker/*.json ./packages/temporal-worker/
COPY ./packages/backend-lib/*.json ./packages/backend-lib/
COPY ./packages/isomorphic-lib/*.json ./packages/isomorphic-lib/

# TODO use frozen lockfile
RUN yarn install --pure-lockfile --production && \
    cp -R node_modules production_node_modules
RUN yarn install --pure_lockfile

COPY ./packages/backend-lib/ ./packages/backend-lib
COPY ./packages/isomorphic-lib/ ./packages/isomorphic-lib
COPY ./packages/temporal-worker/ ./packages/temporal-worker
RUN yarn workspace backend-lib prisma generate && yarn workspace temporal-worker build

# Production image
FROM node:16.14.2 AS runner

WORKDIR /service

COPY --from=builder /service/production_node_modules ./node_modules
COPY --from=builder /service/packages/temporal-worker/dist ./packages/temporal-worker/dist
COPY --from=builder /service/packages/temporal-worker/dist ./packages/backend-lib/dist
COPY --from=builder /service/packages/temporal-worker/dist ./packages/isomorphic-lib/dist

ENV NODE_ENV=production

CMD ["node", "dist/scripts/startWorker.js"]
