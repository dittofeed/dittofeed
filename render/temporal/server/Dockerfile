FROM temporalio/server:1.14.3

COPY temporal-cluster/server/dynamicconfig.yaml /etc/temporal/dynamicconfig.yaml
COPY temporal-cluster/server/dynamicconfig_es.yaml /etc/temporal/dynamicconfig_es.yaml
COPY temporal-cluster/server/config_template.yaml /etc/temporal/config/config_template.yaml
COPY temporal-cluster/server/.bashrc /home/temporal/.bashrc

ENTRYPOINT ["bash", "-c", "PUBLIC_FRONTEND_ADDRESS=$TEMPORAL_FRONTEND_HOST:7233 /etc/temporal/entrypoint.sh"]
