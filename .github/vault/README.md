# Vault + GitHub Actions (dittofeed deploy)

Deploy CI reads **kubeconfig** from Vault (`cicd/github` → `KUBE_CONFIG`).  
Policy and JWT role live in **goldbetgg/infrastructure** (`vault/`).

## Separation from other repos

| JWT role | Repository | Policy | Vault paths |
|----------|------------|--------|-------------|
| `github-actions-goldbet` | goldbetgg/goldbet | `github-cicd-read` | `dev/*/gb-config`, `prod/gb-config`, `cicd/github` |
| `github-actions-infrastructure` | goldbetgg/infrastructure | `github-cicd-infra-dns` | `devops/dns/providers` |
| `github-actions-dittofeed` | goldbetgg/dittofeed | `github-cicd-dittofeed` | `cicd/github` only |

## One-time Vault setup

```bash
cd infrastructure/vault
export VAULT_ADDR=https://vault.hngcweywe.com
export VAULT_TOKEN=<admin>
chmod +x apply-github-cicd-dittofeed-policy.sh
./apply-github-cicd-dittofeed-policy.sh
```

Creates:

- Policy `github-cicd-dittofeed` → read `cicd/data/github`
- JWT role `github-actions-dittofeed` → bound to `goldbetgg/dittofeed`

Ensure `cicd/github` contains `KUBE_CONFIG` (base64 kubeconfig for the dittofeed cluster):

```bash
vault kv get cicd/github
# or put:
# vault kv patch cicd/github KUBE_CONFIG="$(base64 < /path/to/kubeconfig | tr -d '\n')"
```

## GitHub Environments (`prod`, `dev`)

Repository → Settings → Environments → secrets:

| Secret | Value |
|--------|--------|
| `VAULT_GITHUB_ROLE` | `github-actions-dittofeed` |
| `VAULT_GITHUB_AUDIENCE` | `vault-github` |
| `HARBOR_PASSWORD` | Harbor robot `robot$github-actions` |

`VAULT_ADDR` is hardcoded in `.github/workflows/ci.yaml` (`https://vault.hngcweywe.com`).

Loader: `.github/actions/vault-load-kubeconfig/`
