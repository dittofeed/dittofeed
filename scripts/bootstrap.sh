#!/bin/bash
docker compose -f docker-compose.prod.yaml exec api bash -c "node ./packages/api/dist/scripts/bootstrap.js"
