#!/bin/bash
set -euo pipefail

yarn
yarn workspace backend-lib prisma generate
yarn workspace backend-lib tsc --build
yarn workspace dashboard tsc --build
yarn admin bootstrap
