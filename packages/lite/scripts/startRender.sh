#!/bin/bash

# Get the environment variables
REPO=${IMAGE_REPOSITORY}
TAG=${IMAGE_TAG}

# Build the full image URL
FULL_IMAGE="${REPO}:${TAG}"

echo "Using image: $FULL_IMAGE"

# Pull the actual image
docker pull $FULL_IMAGE

# Run your application with the correct image and parameters
docker run -e WORKSPACE_NAME=$WORKSPACE_NAME [other-env-flags] $FULL_IMAGE node --max-old-space-size=412 packages/lite/dist/scripts/startLite.js --workspace-name=$WORKSPACE_NAME