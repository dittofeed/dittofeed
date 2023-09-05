FROM temporalio/auto-setup:1.14.3

COPY temporal-cluster/server/dynamicconfig.yaml /etc/temporal/dynamicconfig.yaml
COPY temporal-cluster/server/dynamicconfig_es.yaml /etc/temporal/dynamicconfig_es.yaml
COPY temporal-cluster/server/config_template.yaml /etc/temporal/config/config_template.yaml
COPY temporal-cluster/server/auto-setup/auto-setup-override.sh /etc/temporal/auto-setup.sh
COPY temporal-cluster/server/.bashrc /home/temporal/.bashrc
