FROM node:20-slim

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update -y && \
    apt-get install -y openssl curl

COPY . .

RUN yarn set version 4.1.1

RUN yarn workspaces focus isomorphic-lib && \
    yarn workspaces focus backend-lib && \
    yarn workspaces focus dashboard

RUN mkdir -p packages/dashboard/public/public && \
    curl https://raw.githubusercontent.com/dittofeed/sdk-web/8ba1161ef3c59f276b30395dc84b3efbc20e6c2d/snippet/dittofeed.umd.js -o packages/dashboard/public/public/dittofeed.umd.js && \
    curl https://raw.githubusercontent.com/dittofeed/sdk-web/8ba1161ef3c59f276b30395dc84b3efbc20e6c2d/snippet/dittofeed.es.js -o packages/dashboard/public/public/dittofeed.es.js

RUN yarn workspace isomorphic-lib build && \
    yarn workspace backend-lib prisma generate && \
    yarn workspace backend-lib build && \
    yarn workspace dashboard build

# Clean up unnecessary files to reduce image size
RUN rm -rf /app/packages/*/src /app/packages/*/tests

EXPOSE 3000

CMD ["node", "server.js"]