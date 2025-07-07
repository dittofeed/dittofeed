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

rm -rf ./packages/backend-lib/src/twentyCrm/coreClient

openapi-generator-cli generate \
  -i ./.tmp/twenty-core-openapi.json \
  -g typescript-axios \
  -o ./packages/backend-lib/src/twentyCrm/coreClient \
  --skip-validate-spec \
  --openapi-normalizer FILTER="tag:people" \
  --type-mappings="CompanyForResponse=object,OpportunityForResponse=object,TaskTargetForResponse=object,NoteTargetForResponse=object,AttachmentForResponse=object,FavoriteForResponse=object,MessageParticipantForResponse=objeGct,CalendarEventParticipantForResponse=object,TimelineActivityForResponse=object" \
  --additional-properties="supportsES6=true,withSeparateModelsAndApi=true,apiPackage=api,modelPackage=model"

# Clean up the api directory
find ./packages/backend-lib/src/twentyCrm/coreClient/api -type f ! -name 'people-api.ts' -delete

# Clean up the model directory
find ./packages/backend-lib/src/twentyCrm/coreClient/model -type f ! -name 'person*.ts' -delete

# Clean up the docs directory
find ./packages/backend-lib/src/twentyCrm/coreClient/docs -type f ! -name 'PeopleApi.md' ! -name 'Person*.md' -delete

# Remove the index.ts file
rm ./packages/backend-lib/src/twentyCrm/coreClient/index.ts

