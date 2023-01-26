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

# Production image, copy all the files and run next
FROM node:16.14.2 AS runner

WORKDIR /service

COPY --from=builder /service/production_node_modules ./node_modules
COPY --from=builder /service/packages/api/dist ./dist
COPY --from=builder /service/packages/api/.env ./

ENV NODE_ENV=production
EXPOSE 3001


CMD ["node", "dist/scripts/startServer.js"]
