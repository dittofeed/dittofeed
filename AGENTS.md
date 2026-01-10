# Agents

## Commands

The following are useful commands for the agents:

```bash
# Lint a specific file in the backend-lib package. A similar command can be used for other packages.
yarn workspace backend-lib eslint src/resources.test.ts --fix

# Run tests for a specific file. A similar command can be used for other packages.
yarn jest packages/backend-lib/src/resources.test.ts

# Run tests and pipe output to a timestamped file in .tmp for debugging.
# Prefer this for large tests to avoid inflating context. The output file can be
# searched and explored more efficiently using Read, Grep, etc.
yarn test:file packages/backend-lib/src/resources.test.ts

# Run tests with jest flags (e.g., -t to filter by test name).
yarn test:file packages/backend-lib/src/resources.test.ts -t "specific test name"

# Reduces the log levels before running tests, providing more verbose log output.
LOG_LEVEL=debug yarn jest packages/backend-lib/src/resources.test.ts

# Run type checking for the backend-lib package. A similar command can be used for other packages.
yarn workspace backend-lib check
```

## Key Files and Directories

- packages/backend-lib/src/config.ts: Where the majority of our applications' environment variables and configuration values are resolved.
- .tmp/: this directory can be used output disposable files for debugging purposes
