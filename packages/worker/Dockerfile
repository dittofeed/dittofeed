# Rebuild the source code only when needed
FROM node:20-slim AS builder

# Accept the build argument in the builder stage
ARG APP_VERSION

WORKDIR /service

RUN yarn set version 4.1.1

RUN apt-get update -y && \
    apt-get install -y openssl

COPY *.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY ./packages/worker/*.json ./packages/worker/
COPY ./packages/backend-lib/*.json ./packages/backend-lib/
COPY ./packages/emailo/*.json ./packages/emailo/
COPY ./packages/isomorphic-lib/*.json ./packages/isomorphic-lib/

RUN yarn workspaces focus worker --production && \
    cp -R node_modules production_node_modules
RUN yarn workspaces focus worker emailo

COPY ./packages/backend-lib/ ./packages/backend-lib
COPY ./packages/emailo/ ./packages/emailo
COPY ./packages/isomorphic-lib/ ./packages/isomorphic-lib
COPY ./packages/worker/ ./packages/worker

RUN yarn workspace emailo build && \
    yarn workspace backend-lib prisma generate && \
    yarn workspace worker build

# Production image
FROM node:20-slim AS runner

# Redefine the ARG in the production stage
ARG APP_VERSION

WORKDIR /service

RUN yarn set version 4.1.1

RUN apt-get update -y && \
    apt-get install -y openssl

COPY --from=builder /service/production_node_modules ./node_modules
COPY --from=builder /service/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /service/package.json ./package.json
COPY --from=builder /service/*.json /service/yarn.lock /service/.yarnrc.yml ./
COPY --from=builder /service/.yarn .yarn

COPY --from=builder /service/packages/worker/dist ./packages/worker/dist
COPY --from=builder /service/packages/worker/package.json ./packages/worker/package.json

COPY --from=builder /service/packages/backend-lib/dist ./packages/backend-lib/dist
COPY --from=builder /service/packages/backend-lib/package.json ./packages/backend-lib/package.json

COPY --from=builder /service/packages/emailo/dist ./packages/emailo/dist
COPY --from=builder /service/packages/emailo/package.json ./packages/emailo/package.json

COPY --from=builder /service/packages/isomorphic-lib/dist ./packages/isomorphic-lib/dist
COPY --from=builder /service/packages/isomorphic-lib/package.json ./packages/isomorphic-lib/package.json

# Set the environment variable
ENV APP_VERSION=${APP_VERSION}

CMD ["yarn", "workspace", "worker", "node", "./dist/scripts/startWorker.js"]
