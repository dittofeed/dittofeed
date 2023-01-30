# Rebuild the source code only when needed
FROM node:16.14.2 AS builder

WORKDIR /service

COPY *.json yarn.lock ./
COPY ./packages/api/*.json ./packages/api/
COPY ./packages/backend-lib/*.json ./packages/backend-lib/
COPY ./packages/isomorphic-lib/*.json ./packages/isomorphic-lib/

# TODO use frozen lockfile
RUN yarn install --pure-lockfile --production && \
    cp -R node_modules production_node_modules
RUN yarn install --pure_lockfile

COPY ./packages/backend-lib/ ./packages/backend-lib
COPY ./packages/isomorphic-lib/ ./packages/isomorphic-lib
COPY ./packages/api/ ./packages/api
RUN yarn workspace backend-lib prisma generate && yarn workspace api build

# Production image
FROM node:16.14.2 AS runner

WORKDIR /service

COPY --from=builder /service/production_node_modules ./node_modules
COPY --from=builder /service/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /service/package.json ./package.json

COPY --from=builder /service/packages/api/dist ./packages/api/dist
COPY --from=builder /service/packages/api/package.json ./packages/api/package.json

COPY --from=builder /service/packages/backend-lib/dist ./packages/backend-lib/dist
COPY --from=builder /service/packages/backend-lib/package.json ./packages/backend-lib/package.json

COPY --from=builder /service/packages/isomorphic-lib/dist ./packages/isomorphic-lib/dist
COPY --from=builder /service/packages/isomorphic-lib/package.json ./packages/isomorphic-lib/package.json

ENV NODE_ENV=production

CMD ["yarn", "workspace", "api", "node", "./dist/scripts/startServer.js"]