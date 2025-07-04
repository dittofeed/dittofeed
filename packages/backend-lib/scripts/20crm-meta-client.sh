#!/bin/bash
echo "Generating TwentyCRM meta client"

if [ -z "$TWENTY_API_KEY" ]; then
    echo "Error: TWENTY_API_KEY environment variable is not defined" >&2
    exit 1
fi

twenty_url="${TWENTY_URL:-http://localhost:3000}"

curl -L \
  -H "Authorization: Bearer $TWENTY_API_KEY" \
  "$twenty_url/open-api/metadata" \
  -o ./.tmp/twenty-meta-openapi.json

rm -rf ./packages/backend-lib/src/twentyCrm/metaClient

openapi-generator-cli generate \
  -i ./.tmp/twenty-meta-openapi.json \
  -g typescript-axios \
  -o ./packages/backend-lib/src/twentyCrm/metaClient \
  --skip-validate-spec \
  --additional-properties="supportsES6=true,withSeparateModelsAndApi=true,apiPackage=api,modelPackage=model"
