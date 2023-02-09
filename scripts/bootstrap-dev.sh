#!/bin/bash
docker compose run --rm api bash -c "node ./packages/api/dist/scripts/bootstrap.js"
