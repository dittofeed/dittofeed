#!/bin/bash
docker compose -f docker-compose.prod.yaml exec \
    admin-cli bash -c 'yarn workspace admin-cli cli "$@"' _ "$@"
