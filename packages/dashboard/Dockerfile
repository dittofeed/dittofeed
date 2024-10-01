# use buster in the build step, lite in the production step
FROM node:20-slim AS builder

# Accept the build argument in the builder stage
ARG APP_VERSION

WORKDIR /app

RUN apt-get update -y && \
    apt-get install -y openssl && \
    apt-get install -y curl

COPY . .

RUN yarn set version 4.1.1

RUN yarn workspaces focus isomorphic-lib && \
    yarn workspaces focus backend-lib && \
    yarn workspaces focus emailo && \
    yarn workspaces focus dashboard

RUN mkdir -p packages/dashboard/public/public && \
    curl https://raw.githubusercontent.com/dittofeed/sdk-web/8ba1161ef3c59f276b30395dc84b3efbc20e6c2d/snippet/dittofeed.umd.js -o packages/dashboard/public/public/dittofeed.umd.js && \
    curl https://raw.githubusercontent.com/dittofeed/sdk-web/8ba1161ef3c59f276b30395dc84b3efbc20e6c2d/snippet/dittofeed.es.js -o packages/dashboard/public/public/dittofeed.es.js

RUN yarn workspace isomorphic-lib build && \
    yarn workspace backend-lib prisma generate && \
    yarn workspace backend-lib build && \
    yarn workspace emailo build && \
    yarn workspace dashboard build

# Production image, copy all the files and run next
FROM node:20-slim AS runner

# Redefine the ARG in the production stage
ARG APP_VERSION

WORKDIR /app

RUN yarn set version 4.1.1

RUN apt-get update -y && \
    apt-get install -y openssl

ENV NODE_ENV=production

# Set the environment variable
ENV APP_VERSION=${APP_VERSION}

# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/packages/dashboard/.next/standalone/packages/dashboard ./
COPY --from=builder /app/packages/dashboard/.next/standalone/node_modules ./node_modules
# static and public should be on CDN
COPY --from=builder /app/packages/dashboard/.next/static ./.next/static
COPY --from=builder /app/packages/dashboard/public ./public
COPY --from=builder /app/.yarn ./.yarn
COPY --from=builder /app/*.json /app/yarn.lock /app/.yarnrc.yml ./

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["node", "server.js"]
