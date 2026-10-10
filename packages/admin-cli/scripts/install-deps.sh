#!/bin/bash
set -euo pipefail

# prep for clickhouse-client
# (the slim base image ships without apt indexes, so refresh them first)
apt-get update && apt-get install -y apt-transport-https ca-certificates dirmngr
CLICKHOUSE_GNUPG_HOME=$(mktemp -d)
trap 'rm -rf "$CLICKHOUSE_GNUPG_HOME"' EXIT
gpg --homedir "$CLICKHOUSE_GNUPG_HOME" --batch --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 8919F6BD2B48D754
# APT requires OpenPGP key material, not GnuPG's internal keybox format.
gpg --homedir "$CLICKHOUSE_GNUPG_HOME" --batch --export-options export-minimal --export 8919F6BD2B48D754 > /usr/share/keyrings/clickhouse-keyring.gpg
chmod +r /usr/share/keyrings/clickhouse-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" | tee \
    /etc/apt/sources.list.d/clickhouse.list

apt-get update && apt-get install -y \
    postgresql-client \
    clickhouse-client

# The apt indexes and cached .deb files are only needed while installing -
# keeping them would add hundreds of MB to the image for nothing.
apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*
