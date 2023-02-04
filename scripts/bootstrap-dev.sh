#!/bin/bash
image="dittofeed-api:development"
docker build . -f packages/api/Dockerfile -t "$image"
source "$( dirname -- "$0"; )/bootstrap.sh"
