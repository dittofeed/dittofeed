#!/bin/bash
echo "Generating TwentyCRM core client"

if [ -z "$TWENTY_API_KEY" ]; then
    echo "Error: TWENTY_API_KEY environment variable is not defined" >&2
    exit 1
fi

twenty_url="${TWENTY_URL:-http://localhost:3000}"

curl -L \
  -H "Authorization: Bearer $TWENTY_API_KEY" \
  "$twenty_url/open-api/core" \
  -o ./.tmp/twenty-core-openapi.json

openapi-generator-cli generate \
  -i ./.tmp/twenty-core-openapi.json \
  -g typescript-axios \
  -o ./packages/backend-lib/src/twentyCrm/coreClient \
  --skip-validate-spec \
  --additional-properties="supportsES6=true,withSeparateModelsAndApi=true,apiPackage=apis,modelPackage=models"
