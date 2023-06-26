#!/bin/bash
docker compose exec \
    -e BOOTSTRAP_WORKER \
    -e BOOTSTRAP_EVENTS \
    -e LOG_LEVEL \
    -e WRITE_MODE \
    admin-cli bash -c "yarn workspace admin-cli cli $@"
