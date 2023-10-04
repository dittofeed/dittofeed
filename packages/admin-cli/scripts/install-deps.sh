#!/bin/bash
set -euo pipefail

# prep for clickhouse-client
apt-get install -y apt-transport-https ca-certificates dirmngr
GNUPGHOME=$(mktemp -d)
GNUPGHOME="$GNUPGHOME" gpg --no-default-keyring --keyring /usr/share/keyrings/clickhouse-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 8919F6BD2B48D754
rm -rf "$GNUPGHOME"
chmod +r /usr/share/keyrings/clickhouse-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" | tee \
    /etc/apt/sources.list.d/clickhouse.list

apt-get update && apt-get install -y \
    vim \
    postgresql-client \
    clickhouse-client

curl -sSf https://temporal.download/cli.sh | sh
