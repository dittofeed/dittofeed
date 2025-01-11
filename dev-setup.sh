#!/bin/bash
set -euo pipefail

yarn
yarn workspace emailo build
yarn workspace backend-lib tsc --build
yarn workspace dashboard tsc --build
yarn admin bootstrap
