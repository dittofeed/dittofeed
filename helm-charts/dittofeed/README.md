## Dittofeed Helm Chart

[Dittofeed](https://dittofeed.com) is an omni-channel customer engagement platform. Create automated user journeys to message users along any channel: email, mobile push notifications, SMS, custom webhooks, Slack, and more. We're an open source, dev-friendly alternative to platforms like OneSignal, Customer.io, and Segment Engage.

This helm chart provides a convenient mechanism for deploying dittofeed-lite.

### Sample Values

The following example values deploy dittofeed with all of its relevant dependencies built-in, including postgres, clickhouse, temporal.

```bash
helm upgrade --install demo ./dittofeed/helm-charts/dittofeed \
  -f dittofeed-values.yaml \
  --atomic --wait
```

```yaml
temporal:
  enabled: true
  env:
    - name: POSTGRES_SEEDS
      value: "demo-postgresql.default.svc.cluster.local"
    - name: POSTGRES_USER
      value: "postgres"
    - name: POSTGRES_PWD
      value: "password"

postgresql:
  enabled: true

clickhouse:
  enabled: true

env:
  # assuming your are in the default namespace
  - name: DATABASE_HOST
    value: "demo-postgresql.default.svc.cluster.local"
  - name: DATABASE_USER
    value: "postgres"
  - name: DATABASE_PASSWORD
    value: "password"
  - name: CLICKHOUSE_HOST
    value: "http://demo-clickhouse.default.svc.cluster.local:8123"
  - name: CLICKHOUSE_USER
    value: "dittofeed"
  - name: CLICKHOUSE_PASSWORD
    value: "password"
  - name: TEMPORAL_ADDRESS
    value: "demo-dittofeed-temporal:80"
```

## Parameters

| Key                                 | Default Value                                      | Description |
|-------------------------------------|----------------------------------------------------|-------------|
| `workspaceName`                     | `Dittofeed`                                        | The name of the workspace. |
| `replicaCount`                      | `1`                                                | Number of replicas. |
| `maxOldSpaceSize`                   | `412`                                              | Maximum old space size for the JVM. |
| `image.repository`                  | `dittofeed/dittofeed-lite`                         | Docker image repository. |
| `image.pullPolicy`                  | `IfNotPresent`                                     | Image pull policy. |
| `image.tag`                         | `""`                                               | Image tag to use, defaults to the chart appVersion. |
| `imagePullSecrets`                  | `[]`                                               | Secrets for image pulling. |
| `nameOverride`                      | `""`                                               | Name override. |
| `fullnameOverride`                  | `""`                                               | Full name override. |
| `serviceAccount.create`             | `true`                                             | Whether to create a service account. |
| `serviceAccount.automount`          | `true`                                             | Automatically mount a ServiceAccount's API credentials. |
| `serviceAccount.annotations`        | `{}`                                               | Annotations for the service account. |
| `serviceAccount.name`               | `""`                                               | Name of the service account to use. |
| `podAnnotations`                    | `{}`                                               | Annotations for the pod. |
| `podLabels`                         | `{}`                                               | Labels for the pod. |
| `podSecurityContext`                | `{}`                                               | Security context for the pod. |
| `securityContext`                   | `{}`                                               | Security context for the container. |
| `service.type`                      | `ClusterIP`                                        | Service type. |
| `service.port`                      | `80`                                               | Service port. |
| `ingress.enabled`                   | `false`                                            | Enable ingress. |
| `ingress.className`                 | `""`                                               | Ingress class name. |
| `ingress.annotations`               | `{}`                                               | Annotations for ingress. |
| `ingress.hosts`                     | `[ { host: "chart-example.local", paths: [ { path: "/", pathType: "ImplementationSpecific" } ] } ]` | Hosts configuration for ingress. |
| `ingress.tls`                       | `[]`                                               | TLS configuration for ingress. |
| `resources.limits.cpu`              | `1`                                                | CPU limits for the container. |
| `resources.limits.memory`           | `512Mi`                                            | Memory limits for the container. |
| `resources.requests.cpu`            | `1`                                                | CPU requests for the container. |
| `resources.requests.memory`         | `512Mi`                                            | Memory requests for the container. |
| `clickhouse.enabled`                | `false`                                            | Enable ClickHouse installation. |
| `clickhouse.shards`                 | `1`                                                | Number of ClickHouse shards. |
| `clickhouse.resources.limits.memory`| `1024Mi`                                           | Memory limits for ClickHouse. |
| `clickhouse.resources.requests.memory` | `1024Mi`                                          | Memory requests for ClickHouse. |
| `clickhouse.zookeeper.enabled`      | `false`                                            | Enable Zookeeper for ClickHouse. |
| `clickhouse.keeper.enabled`         | `true`                                             | Enable Keeper for ClickHouse. |
| `clickhouse.auth.username`          | `dittofeed`                                        | ClickHouse username. |
| `clickhouse.auth.password`          | `password`                                         | ClickHouse password. |
| `clickhouse.auth.database`          | `dittofeed`                                        | ClickHouse database. |
| `clickhouse.auth.existingSecret`    | `""`                                               | Existing secret for ClickHouse password. |
| `clickhouse.auth.existingSecretKey` | `""`                                               | Key for ClickHouse password in existing secret. |
| `postgresql.enabled`                | `false`                                            | Enable PostgreSQL installation. |
| `postgresql.auth.username`          | `postgres`                                         | PostgreSQL username. |
| `postgresql.auth.password`          | `password`                                         | PostgreSQL password. |
| `postgresql.auth.database`          | `dittofeed`                                        | PostgreSQL database. |
| `postgresql.auth.existingSecret`    | `""`                                               | Existing secret for PostgreSQL password. |
| `postgresql.auth.userPasswordKey`   | `""`                                               | Key for PostgreSQL password in existing secret. |
| `temporal.enabled`                  | `false`                                            | Enable standalone Temporal installation. |
| `temporal.resources`                | `{}`                                               | Resources for Temporal. |
| `temporal.env`                      | `[ { name: POSTGRES_SEEDS, value: "dittofeed-postgresql.default.svc.cluster.local" }, { name: POSTGRES_USER, value: "postgres" }, { name: POSTGRES_PWD, value: "password" } ]` | Environment variables for Temporal. |
| `temporal.image.repository`         | `temporalio/auto-setup`                            | Docker image repository for Temporal. |
| `temporal.image.tag`                | `1.23.1.0`                                         | Image tag for Temporal. |
| `temporal.image.pullPolicy`         | `IfNotPresent`                                     | Image pull policy for Temporal. |
| `env`                               | `[ { name: DATABASE_HOST, value: "dittofeed-postgresql.default.svc.cluster.local" }, { name: DATABASE_USER, value: "postgres" }, { name: DATABASE_PASSWORD, value: "password" }, { name: CLICKHOUSE_HOST, value: "http://dittofeed-clickhouse.default.svc.cluster.local:8123" }, { name: CLICKHOUSE_USER, value: "dittofeed" }, { name: CLICKHOUSE_PASSWORD, value: "password" }, { name: TEMPORAL_ADDRESS, value: "demo-dittofeed-temporal:80" } ]` | Environment variables for the application. |
| `nodeSelector`                      | `{}`                                               | Node selector for pod scheduling. |
| `tolerations`                       | `[]`                                               | Tolerations for pod scheduling. |
| `affinity`                          | `{}`                                               | Affinity rules for pod scheduling. |

## Contributing

### Testing

Use these commands locally (from the repo root) to validate template rendering in both modes and verify there are no autoscaling resources.

Basic renders

```bash
# Default (bundled) mode
helm template demo ./helm-charts/dittofeed

# Separate workers enabled
helm template demo ./helm-charts/dittofeed --set separateWorker.enabled=true
```
