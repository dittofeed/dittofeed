#!/bin/bash
set -euo pipefail

yarn
yarn workspace backend-lib prisma generate
