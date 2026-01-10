#!/bin/bash

# Script to run jest tests and pipe output to a timestamped file in .tmp
# Usage: ./scripts/test-to-file.sh <test-path> [jest-flags...]
# Example: ./scripts/test-to-file.sh packages/backend-lib/src/journeys/keyedEventEntry.test.ts -t "specific test name"

if [ -z "$1" ]; then
  echo "Usage: yarn test:file <test-path> [jest-flags...]"
  echo "Example: yarn test:file packages/backend-lib/src/journeys/keyedEventEntry.test.ts -t 'specific test'"
  exit 1
fi

TEST_PATH="$1"
shift

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Extract test filename without extension for the log filename
TEST_BASENAME=$(basename "$TEST_PATH" .ts)

# Create output filename
OUTPUT_FILE=".tmp/${TIMESTAMP}-${TEST_BASENAME}.log"

echo "Writing test output to: ${OUTPUT_FILE}"

# Run jest and pipe both stdout and stderr to the file
yarn jest "$TEST_PATH" "$@" > "$OUTPUT_FILE" 2>&1
EXIT_CODE=$?

echo "Test complete."
exit $EXIT_CODE
