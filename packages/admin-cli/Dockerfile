# Rebuild the source code only when needed
FROM node:20-buster AS builder

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

RUN yarn workspaces focus backend-lib && yarn workspaces focus admin-cli

COPY ./packages/backend-lib/ ./packages/backend-lib
COPY ./packages/isomorphic-lib/ ./packages/isomorphic-lib
COPY ./packages/admin-cli/ ./packages/admin-cli

RUN yarn workspace backend-lib prisma generate && \
    yarn workspace backend-lib build && \
    yarn workspace admin-cli build

ENTRYPOINT ["./admin.sh"]
