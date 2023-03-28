#!/bin/bash
docker compose run \
    -e BOOTSTRAP_WORKER \
    -e BOOTSTRAP_EVENTS \
    -e WRITE_MODE \
    --rm api bash -c "node ./packages/api/dist/scripts/bootstrap.js"
