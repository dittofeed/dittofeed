# Rebuild the source code only when needed
FROM node:20-slim AS builder

# Add this line to accept the build argument
ARG APP_VERSION

WORKDIR /service

RUN yarn set version 4.1.1

RUN apt-get update -y && \
    apt-get install -y openssl

ENV PATH="$PATH:/root/.temporalio/bin"

COPY ./packages/admin-cli/scripts/install-deps.sh ./
COPY ./packages/admin-cli/scripts/admin.sh ./
RUN chmod +x ./install-deps.sh && \
    chmod +x ./admin.sh && \
    ./install-deps.sh

COPY *.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY ./packages/admin-cli/*.json ./packages/admin-cli/
COPY ./packages/backend-lib/*.json ./packages/backend-lib/
COPY ./packages/isomorphic-lib/*.json ./packages/isomorphic-lib/

RUN yarn workspaces focus admin-cli --production && \
    cp -R node_modules production_node_modules
RUN yarn workspaces focus admin-cli

COPY ./packages/backend-lib/ ./packages/backend-lib
COPY ./packages/isomorphic-lib/ ./packages/isomorphic-lib
COPY ./packages/admin-cli/ ./packages/admin-cli

RUN yarn workspace backend-lib prisma generate && \
    yarn workspace admin-cli build

# Production image
FROM node:20-slim AS runner

WORKDIR /service

RUN yarn set version 4.1.1

RUN apt-get update -y && \
    apt-get install -y openssl

COPY --from=builder /service/production_node_modules ./node_modules
COPY --from=builder /service/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /service/package.json ./package.json
COPY --from=builder /service/*.json /service/yarn.lock /service/.yarnrc.yml ./
COPY --from=builder /service/.yarn .yarn

COPY --from=builder /service/packages/admin-cli/dist ./packages/admin-cli/dist
COPY --from=builder /service/packages/admin-cli/package.json ./packages/admin-cli/package.json

COPY --from=builder /service/packages/backend-lib/dist ./packages/backend-lib/dist
COPY --from=builder /service/packages/backend-lib/package.json ./packages/backend-lib/package.json

COPY --from=builder /service/packages/isomorphic-lib/dist ./packages/isomorphic-lib/dist
COPY --from=builder /service/packages/isomorphic-lib/package.json ./packages/isomorphic-lib/package.json

# Add this line to set the environment variable
ENV APP_VERSION=${APP_VERSION}

ENTRYPOINT ["yarn", "workspace", "admin-cli", "node", "./dist/index.js"]
