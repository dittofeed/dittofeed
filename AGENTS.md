# Agents

## Commands

The following are useful commands for the agents:

```bash
# Lint a specific file in the backend-lib package. A similar command can be used for other packages.
yarn workspace backend-lib eslint src/resources.test.ts --fix

# Run tests for a specific file. A similar command can be used for other packages.
yarn jest packages/backend-lib/src/resources.test.ts

# Reduces the log levels before running tests, providing more verbose log output.
LOG_LEVEL=debug yarn jest packages/backend-lib/src/resources.test.ts

# Run type checking for the backend-lib package. A similar command can be used for other packages.
yarn workspace backend-lib check
```

## Key Files and Directories

- packages/backend-lib/src/config.ts: Where the majority of our applications' environment variables and configuration values are resolved.
- .tmp/: this directory can be used output disposable files for debugging purposes
