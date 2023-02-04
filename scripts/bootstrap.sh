#!/bin/bash
image=${image:-dittofeed/dittofeed-api}
cmd="yarn workspace api node ./dist/scripts/bootstrap.js"
mnt="$PWD/mnt:/dittofeed-mnt"

docker run \
    --rm \
    --network host \
    -v "$mnt" \
    "$image" bash -c "$cmd"

