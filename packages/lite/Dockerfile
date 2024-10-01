FROM node:20-buster AS builder

# Accept the build argument in the builder stage
ARG APP_VERSION

WORKDIR /service

RUN apt-get update -y && \
    apt-get install -y openssl

COPY *.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY ./packages/lite/*.json ./packages/lite/
COPY ./packages/api/*.json ./packages/api/
COPY ./packages/dashboard/*.json ./packages/dashboard/
COPY ./packages/worker/*.json ./packages/worker/
COPY ./packages/admin-cli/*.json ./packages/admin-cli/
COPY ./packages/backend-lib/*.json ./packages/backend-lib/
COPY ./packages/isomorphic-lib/*.json ./packages/isomorphic-lib/
COPY ./packages/emailo/*.json ./packages/emailo/

RUN yarn set version 4.1.1
RUN yarn workspaces focus lite --production && \
    cp -R node_modules production_node_modules
RUN yarn workspaces focus lite

COPY ./packages/backend-lib/ ./packages/backend-lib
COPY ./packages/isomorphic-lib/ ./packages/isomorphic-lib
COPY ./packages/api/ ./packages/api
COPY ./packages/dashboard/ ./packages/dashboard
COPY ./packages/worker/ ./packages/worker
COPY ./packages/admin-cli/ ./packages/admin-cli
COPY ./packages/emailo/ ./packages/emailo

RUN yarn workspace backend-lib prisma generate && \
    yarn workspace api build && \
    yarn workspace worker build && \
    yarn workspace admin-cli build && \
    yarn workspace emailo build && \
    yarn workspace dashboard build

COPY ./packages/lite/ ./packages/lite
RUN yarn workspace lite build

# Production image
FROM node:20-buster AS runner

# Redefine the ARG in the production stage
ARG APP_VERSION

ARG WORKSPACE_NAME='Default'

WORKDIR /service

RUN yarn set version 4.1.1

COPY --from=builder /service/production_node_modules ./node_modules
COPY --from=builder /service/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /service/package.json ./package.json
COPY --from=builder /service/*.json /service/yarn.lock /service/.yarnrc.yml ./
COPY --from=builder /service/.yarn .yarn

COPY --from=builder /service/packages/lite/dist ./packages/lite/dist
COPY --from=builder /service/packages/lite/package.json ./packages/lite/package.json

COPY --from=builder /service/packages/emailo/dist ./packages/emailo/dist
COPY --from=builder /service/packages/emailo/package.json ./packages/emailo/package.json

COPY --from=builder /service/packages/dashboard/dist ./packages/dashboard/dist
COPY --from=builder /service/packages/dashboard/.next ./packages/dashboard/.next
COPY --from=builder /service/packages/dashboard/next.config.js ./packages/dashboard/next.config.js
COPY --from=builder /service/packages/dashboard/package.json ./packages/dashboard/package.json

COPY --from=builder /service/packages/api/dist ./packages/api/dist
COPY --from=builder /service/packages/api/package.json ./packages/api/package.json

COPY --from=builder /service/packages/worker/dist ./packages/worker/dist
COPY --from=builder /service/packages/worker/package.json ./packages/worker/package.json

COPY --from=builder /service/packages/admin-cli/dist ./packages/admin-cli/dist
COPY --from=builder /service/packages/admin-cli/package.json ./packages/admin-cli/package.json

COPY --from=builder /service/packages/backend-lib/dist ./packages/backend-lib/dist
COPY --from=builder /service/packages/backend-lib/package.json ./packages/backend-lib/package.json
COPY --from=builder /service/packages/backend-lib/prisma ./packages/backend-lib/prisma

COPY --from=builder /service/packages/isomorphic-lib/dist ./packages/isomorphic-lib/dist
COPY --from=builder /service/packages/isomorphic-lib/package.json ./packages/isomorphic-lib/package.json

ENV NODE_ENV=production \
    PRE_BUILT=true \
    AUTH_MODE='single-tenant' \
    WORKSPACE_NAME=${WORKSPACE_NAME} \
    PATH="$PATH:/root/.temporalio/bin" \
    APP_VERSION=${APP_VERSION}

# provide admin-cli scripts entrypoint
COPY ./packages/admin-cli/scripts/install-deps.sh ./
COPY ./packages/admin-cli/scripts/admin.sh ./
RUN chmod +x ./install-deps.sh && \
    chmod +x ./admin.sh && \
    ./install-deps.sh

EXPOSE 3000

CMD node ./packages/lite/dist/scripts/startLite.js --workspace-name=${WORKSPACE_NAME}
