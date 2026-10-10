# Multi-stage build: the CLI only needs the built output plus its runtime
# dependencies, but building it needs the full toolchain (TypeScript, eslint
# config, the other workspaces' sources). Keeping both in one stage - as this
# file used to - shipped the whole toolchain, the apt indexes and every
# devDependency in the final image (~5GB).
#
# The entrypoint runs the compiled CLI (./admin.sh); the sources and tsconfig
# chain are also copied so `yarn admin ...` (ts-node, wired up by
# docker-compose's src bind-mounts) keeps working inside the container.
FROM node:24.21.0-trixie-slim AS builder

# Accept the build argument in the builder stage
ARG APP_VERSION

WORKDIR /service

RUN yarn set version 4.1.1

COPY *.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY ./packages/admin-cli/*.json ./packages/admin-cli/
COPY ./packages/backend-lib/*.json ./packages/backend-lib/
COPY ./packages/isomorphic-lib/*.json ./packages/isomorphic-lib/
COPY ./packages/emailo/*.json ./packages/emailo/

# Snapshot the runtime dependency tree before the build-only dependencies are
# installed, so the runner stage can copy just this and skip the toolchain.
RUN yarn workspaces focus backend-lib admin-cli emailo --production && \
    cp -R node_modules production_node_modules

RUN yarn workspaces focus backend-lib admin-cli emailo

COPY ./packages/backend-lib/ ./packages/backend-lib
COPY ./packages/isomorphic-lib/ ./packages/isomorphic-lib
COPY ./packages/admin-cli/ ./packages/admin-cli
COPY ./packages/emailo/ ./packages/emailo

RUN yarn workspace emailo build && \
    yarn workspace backend-lib build && \
    yarn workspace admin-cli build

# Production image
FROM node:24.21.0-trixie-slim AS runner

# Redefine the ARG in the production stage
ARG APP_VERSION

WORKDIR /service

RUN yarn set version 4.1.1

# psql / clickhouse-client for the admin commands that shell out to them.
COPY ./packages/admin-cli/scripts/install-deps.sh ./
COPY ./packages/admin-cli/scripts/admin.sh ./
RUN chmod +x ./install-deps.sh ./admin.sh && \
    ./install-deps.sh

COPY --from=builder /service/production_node_modules ./node_modules
COPY --from=builder /service/*.json /service/yarn.lock /service/.yarnrc.yml ./
# The .yarn cache is only needed while installing; `yarn set version` above
# already put the release under .yarn/releases, which is all the runtime needs.

# Type declarations and the TypeScript compiler are devDependencies, so
# `--production` drops them - but the ts-node path (`yarn admin ...`, wired to
# the bind-mounted sources) compiles the TypeScript on the fly and needs both.
COPY --from=builder /service/node_modules/@types ./node_modules/@types
COPY --from=builder /service/node_modules/typescript ./node_modules/typescript

COPY --from=builder /service/packages/backend-lib/dist ./packages/backend-lib/dist
COPY --from=builder /service/packages/backend-lib/src ./packages/backend-lib/src
COPY --from=builder /service/packages/backend-lib/*.json ./packages/backend-lib/

COPY --from=builder /service/packages/isomorphic-lib/dist ./packages/isomorphic-lib/dist
COPY --from=builder /service/packages/isomorphic-lib/src ./packages/isomorphic-lib/src
COPY --from=builder /service/packages/isomorphic-lib/*.json ./packages/isomorphic-lib/

COPY --from=builder /service/packages/emailo/dist ./packages/emailo/dist
COPY --from=builder /service/packages/emailo/src ./packages/emailo/src
COPY --from=builder /service/packages/emailo/*.json ./packages/emailo/

COPY --from=builder /service/packages/admin-cli/dist ./packages/admin-cli/dist
COPY --from=builder /service/packages/admin-cli/src ./packages/admin-cli/src
COPY --from=builder /service/packages/admin-cli/scripts ./packages/admin-cli/scripts
COPY --from=builder /service/packages/admin-cli/*.json ./packages/admin-cli/

# Set the environment variable
ENV APP_VERSION=${APP_VERSION}

ENTRYPOINT ["./admin.sh"]
