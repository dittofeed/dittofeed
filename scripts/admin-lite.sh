#!/bin/bash
docker compose -f docker-compose.lite.yaml exec \
    admin-cli bash -c './admin.sh "$@"' _ "$@"
