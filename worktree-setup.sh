#!/bin/bash
set -euo pipefail

yarn workspace emailo build
yarn workspace backend-lib check
yarn workspace dashboard check
yarn workspace admin-cli check
yarn admin bootstrap
