## Dittofeed Helm Chart

[Dittofeed](https://dittofeed.com) is an omni-channel customer engagement platform. Create automated user journeys to message users along any channel: email, mobile push notifications, SMS, custom webhooks, Slack, and more. We're an open source, dev-friendly alternative to platforms like OneSignal, Customer.io, and Segment Engage.

This helm chart provides a convenient mechanism for deploying dittofeed-admin-cli.

### Sample Values

The following example values deploy dittofeed-admin-cli.

```bash
helm upgrade --install dittofeed-admin-cli ./dittofeed/helm-charts/dittofeed-admin-cli
```

Then you can exec into the pod:

```bash
kubectl exec -it deployment/dittofeed-admin-cli -- /bin/bash
```

Then run the cli:

```bash
./admin.sh bootstrap
```

```yaml
# Example env variables:
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
| `resources.limits.cpu`              | `1`                                                | CPU limits for the container. |
| `resources.limits.memory`           | `512Mi`                                            | Memory limits for the container. |
| `resources.requests.cpu`            | `1`                                                | CPU requests for the container. |
| `resources.requests.memory`         | `512Mi`                                            | Memory requests for the container. |
| `nodeSelector`                      | `{}`                                               | Node selector for pod scheduling. |
| `tolerations`                       | `[]`                                               | Tolerations for pod scheduling. |
| `affinity`                          | `{}`                                               | Affinity rules for pod scheduling. |
