#!/usr/bin/env bash
# Read KUBE_CONFIG from Vault KV v2 path cicd/github.
set -euo pipefail

path="cicd/github"
kubeconfig_file="${RUNNER_TEMP:-/tmp}/kubeconfig-${GITHUB_RUN_ID:-local}"

for key in VAULT_ADDR VAULT_GITHUB_ROLE VAULT_GITHUB_AUDIENCE; do
  if [ -z "${!key:-}" ]; then
    echo "::error::$key is not set (GitHub Environment secret)"
    exit 1
  fi
done

if [ -f "${GITHUB_WORKSPACE}/cicd/certs/vault-internal-ca.pem" ]; then
  export CURL_CA_BUNDLE="${GITHUB_WORKSPACE}/cicd/certs/vault-internal-ca.pem"
elif [ -n "${VAULT_CACERT:-}" ]; then
  export CURL_CA_BUNDLE="${RUNNER_TEMP}/vault-ca.pem"
  printf '%s\n' "$VAULT_CACERT" > "$CURL_CA_BUNDLE"
elif [[ "${VAULT_ADDR}" == *"vault.hngcweywe.com"* ]]; then
  :
else
  echo "::error::Vault TLS: missing cicd/certs/vault-internal-ca.pem and secrets.VAULT_CACERT"
  exit 1
fi

vault_addr="${VAULT_ADDR%/}"

oidc_token="$(
  curl -sSf \
    -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
    "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${VAULT_GITHUB_AUDIENCE}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["value"])'
)"
if [ -n "${oidc_token}" ] && [ "${#oidc_token}" -ge 4 ]; then
  echo "::add-mask::${oidc_token}"
fi

login_body="$(
  VAULT_GITHUB_ROLE="$VAULT_GITHUB_ROLE" OIDC_TOKEN="$oidc_token" python3 -c \
    'import json,os; print(json.dumps({"role":os.environ["VAULT_GITHUB_ROLE"],"jwt":os.environ["OIDC_TOKEN"]}))'
)"

login_resp="$(mktemp)"
login_code="$(
  curl -sS -o "$login_resp" -w '%{http_code}' \
    -X POST -H "Content-Type: application/json" \
    -d "$login_body" \
    "${vault_addr}/v1/auth/github-jwt/login"
)"
if [ "$login_code" != "200" ]; then
  echo "::error::Vault login HTTP ${login_code}: $(head -c 400 "$login_resp")"
  exit 1
fi
vault_token="$(
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["auth"]["client_token"])' "$login_resp"
)"
rm -f "$login_resp"
if [ -n "${vault_token}" ] && [ "${#vault_token}" -ge 4 ]; then
  echo "::add-mask::${vault_token}"
fi

mount="${path%%/*}"
rel="${path#*/}"
kv_resp="$(mktemp)"
kv_code="$(
  curl -sS -o "$kv_resp" -w '%{http_code}' \
    -H "X-Vault-Token: ${vault_token}" \
    "${vault_addr}/v1/${mount}/data/${rel}"
)"
if [ "$kv_code" != "200" ]; then
  echo "::error::Vault read ${path} HTTP ${kv_code}: $(head -c 400 "$kv_resp")"
  if [ "$kv_code" = "403" ]; then
    echo "::error::403: policy must allow ${mount}/data/${rel} (see infrastructure/vault/github-cicd-read.hcl)"
  fi
  exit 1
fi

KUBECONFIG_FILE="$kubeconfig_file" VAULT_KV_RESPONSE="$kv_resp" python3 <<'PY'
import base64
import json
import os
import stat

data = json.load(open(os.environ["VAULT_KV_RESPONSE"]))["data"]["data"]
kube = data.get("KUBE_CONFIG", "")
if not kube:
    raise SystemExit("KUBE_CONFIG missing in cicd/github")

try:
    decoded = base64.b64decode(kube, validate=True).decode()
    if "apiVersion:" in decoded:
        kube = decoded
except Exception:
    pass

path = os.environ["KUBECONFIG_FILE"]
with open(path, "w", encoding="utf-8") as handle:
    handle.write(kube if kube.endswith("\n") else kube + "\n")
os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
PY
rm -f "$kv_resp"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "kubeconfig_file=${kubeconfig_file}" >> "$GITHUB_OUTPUT"
fi
