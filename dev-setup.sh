#!/bin/bash
set -euo pipefail

yarn
yarn workspace admin-cli cli prisma generate
yarn workspace dashboard tsc --build
